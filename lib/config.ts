/**
 * Parse, normalize, validate, and inspect repository configuration documents.
 *
 * Persistence and GitHub sync live in `lib/config-store.ts`.
 */

import YAML from "yaml";
import { getFileExtension, extensionCategories } from "@/lib/utils/file";
import { ConfigSchema } from "@/lib/config-schema";
import { z } from "zod";
import mergeWith from "lodash.mergewith";

const configVersion = "3.0";

type NavigationNode = {
  type: "group" | "file" | "collection" | "media";
  name: string;
  label?: string;
  items?: NavigationNode[];
};

const resolveSettingsObject = (configObject?: Record<string, any>) => {
  if (!configObject || typeof configObject !== "object") return {};
  return (configObject.settings && typeof configObject.settings === "object")
    ? configObject.settings
    : {};
};

const isConfigEnabled = (configObject?: Record<string, any>) => {
  const settings = resolveSettingsObject(configObject);

  if (typeof settings.config === "boolean") return settings.config;
  if (typeof settings.hide === "boolean") return !settings.hide;
  return true;
};

const isCacheEnabled = (configObject?: Record<string, any>) => {
  const settings = resolveSettingsObject(configObject);

  if (typeof settings.cache === "boolean") return settings.cache;
  if (typeof (configObject as any)?.cache === "boolean") return Boolean((configObject as any).cache);
  return false;
};

// Parse the config file (YAML to JSON)
const parseConfig = (content: string) => {
  const document = YAML.parseDocument(content, {
    strict: false,
    prettyErrors: false,
  });

  let errors = document.errors.map((error) => {
    return {
      severity: "error",
      from: error.pos ? error.pos[0] : null,
      to: error.pos ? error.pos[1] : null,
      message: error.message, // TODO: refine error messages
      yaml: error,
    };
  });

  return { document, errors };
};

// Normalize the config object (e.g. convert media.input to a relative path, set
// default values for filename, extension, format, etc.)
const normalizeConfig = (configObject: any) => {
  if (!configObject) return {};

  const configObjectCopy = JSON.parse(JSON.stringify(configObject));

  // Normalize legacy root toggles into settings.
  if (configObjectCopy.settings === false) {
    configObjectCopy.settings = { config: false };
  } else if (
    typeof configObjectCopy.settings !== "object" ||
    configObjectCopy.settings == null
  ) {
    configObjectCopy.settings = {};
  }
  if (
    typeof configObjectCopy.cache === "boolean" &&
    configObjectCopy.settings.cache == null
  ) {
    configObjectCopy.settings.cache = configObjectCopy.cache;
  }
  if (
    typeof configObjectCopy.hide === "boolean" &&
    configObjectCopy.settings.config == null
  ) {
    configObjectCopy.settings.config = !configObjectCopy.hide;
  }
  delete configObjectCopy.cache;
  delete configObjectCopy.hide;

  // Resolve component references in `components`
  if (
    configObjectCopy.components &&
    typeof configObjectCopy.components === "object"
  ) {
    Object.keys(configObjectCopy.components).forEach((componentKey: string) => {
      configObjectCopy.components[componentKey] = resolveComponent(
        configObjectCopy.components[componentKey],
        configObjectCopy.components,
      );
    });
  }

  if (configObjectCopy?.media) {
    if (typeof configObjectCopy.media === "string") {
      // Ensure media.input is a relative path (and add name and label)
      const relativePath = configObjectCopy.media.replace(/^\/|\/$/g, "");
      configObjectCopy.media = [
        {
          name: "default",
          label: "Media",
          input: relativePath,
          output: `/${relativePath}`,
        },
      ];
    } else if (
      typeof configObjectCopy.media === "object" &&
      !Array.isArray(configObjectCopy.media)
    ) {
      // Ensure it's an array of media configurations (and add name and label)
      configObjectCopy.media = [
        {
          name: "default",
          label: "Media",
          ...configObjectCopy.media,
        },
      ];
    }

    // We normalize each media configuration
    configObjectCopy.media = configObjectCopy.media.map((mediaConfig: any) => {
      if (mediaConfig.input != null && typeof mediaConfig.input === "string") {
        // Make sure input is relative
        mediaConfig.input = mediaConfig.input.replace(/^\/|\/$/g, "");
      }
      if (
        mediaConfig.output != null &&
        mediaConfig.output !== "/" &&
        typeof mediaConfig.output === "string"
      ) {
        // Make sure output doesn"t have a trailing slash
        mediaConfig.output = mediaConfig.output.replace(/\/$/, "");
      }
      if (mediaConfig.categories != null) {
        if (mediaConfig.extensions != null) {
          delete mediaConfig.categories;
        } else if (Array.isArray(mediaConfig.categories)) {
          mediaConfig.extensions = [];
          mediaConfig.categories.map((category: string) => {
            if (extensionCategories[category] != null) {
              mediaConfig.extensions = mediaConfig.extensions.concat(
                extensionCategories[category],
              );
            }
          });
          delete mediaConfig.categories;
        }
      }

      if (mediaConfig.commit && typeof mediaConfig.commit === "object") {
        if (
          mediaConfig.commit.message &&
          typeof mediaConfig.commit.message === "object" &&
          (mediaConfig.commit.templates == null ||
            typeof mediaConfig.commit.templates !== "object")
        ) {
          mediaConfig.commit.templates = mediaConfig.commit.message;
        }
        delete mediaConfig.commit.message;
      }

      return mediaConfig;
    });
  }

  const navigation: Record<string, NavigationNode[]> = {};

  // Normalize content
  if (
    configObjectCopy.content &&
    Array.isArray(configObjectCopy?.content) &&
    configObjectCopy.content.length > 0
  ) {
    const normalizedContent = normalizeContentEntries(
      configObjectCopy.content,
      configObjectCopy?.components,
    );
    configObjectCopy.content = normalizedContent.items;
    navigation.content = normalizedContent.navigation;
  }

  // Normalize settings
  if (
    configObjectCopy.settings &&
    typeof configObjectCopy.settings === "object"
  ) {
    if (
      typeof configObjectCopy.settings.hide === "boolean" &&
      configObjectCopy.settings.config == null
    ) {
      configObjectCopy.settings.config = !configObjectCopy.settings.hide;
    }
    delete configObjectCopy.settings.hide;

    if (
      configObjectCopy.settings.commit &&
      typeof configObjectCopy.settings.commit === "object"
    ) {
      const commit = configObjectCopy.settings.commit;
      if (
        commit.message &&
        typeof commit.message === "object" &&
        (commit.templates == null || typeof commit.templates !== "object")
      ) {
        commit.templates = commit.message;
      }
      delete commit.message;
    }
  }

  if (
    Array.isArray(configObjectCopy.media) &&
    configObjectCopy.media.length > 0
  ) {
    navigation.media = configObjectCopy.media.map((item: any) => ({
      type: "media",
      name: item.name || "default",
      label: item.label || item.name || "Media",
    }));
  }

  if (Object.keys(navigation).length > 0) {
    configObjectCopy.navigation = navigation;
  } else {
    delete configObjectCopy.navigation;
  }

  if (Array.isArray(configObjectCopy.media) && Array.isArray(configObjectCopy.content)) {
    configObjectCopy.media = configObjectCopy.media.map((mediaConfig: any) => {
      if (mediaConfig.input == null || mediaConfig.input === "") {
        const matchingContent = configObjectCopy.content.find(
          (contentItem: any) => contentItem.name === mediaConfig.name
        );
        if (matchingContent?.path) {
          mediaConfig.input = matchingContent.path.replace(/^\/|\/$/g, "");
        }
      }
      return mediaConfig;
    });
  }

  return configObjectCopy;
};

const normalizeContentEntry = (
  item: any,
  componentsMap: Record<string, any>,
) => {
  if (item.path != null) {
    item.path = item.path.replace(/^\/|\/$/g, "");
  }
  if (
    item.type === "collection" &&
    item.filename &&
    typeof item.filename === "object"
  ) {
    if (typeof item.filename.template === "string") {
      const filenameField = item.filename.field;
      item.filename = item.filename.template;
      if (
        filenameField === true ||
        filenameField === false ||
        filenameField === "create"
      ) {
        item.filenameField = filenameField;
      }
    }
  }
  if (item.filename == null && item.type === "collection") {
    item.filename = "{year}-{month}-{day}-{primary}.md";
  }
  if (item.extension == null) {
    const filename = item.type === "file" ? item.path : item.filename;
    item.extension = getFileExtension(filename);
  }
  if (item.format == null) {
    item.format = "raw";
    const codeExtensions = [
      "yaml",
      "yml",
      "javascript",
      "js",
      "jsx",
      "typescript",
      "ts",
      "tsx",
      "json",
      "html",
      "htm",
      "markdown",
      "md",
      "mdx",
    ];
    if (item.fields?.length > 0) {
      switch (item.extension) {
        case "json":
          item.format = "json";
          break;
        case "toml":
          item.format = "toml";
          break;
        case "yaml":
        case "yml":
          item.format = "yaml";
          break;
        default:
          // TODO: should we default to this or only consider "markdown", "md", "mdx" and "html"
          // This may catch things like csv or xml for example, which is acceptable IMO (e.g. sitemap.xml)
          item.format = "yaml-frontmatter";
          break;
      }
    } else if (codeExtensions.includes(item.extension)) {
      item.format = "code";
    } else if (item.extension === "csv") {
      item.format = "datagrid";
    }
  }
  if (item.view?.node && typeof item.view.node === "string") {
    item.view.node = {
      filename: item.view.node,
      hideDirs: "nodes",
    };
  }

  if (item.commit && typeof item.commit === "object") {
    if (
      item.commit.message &&
      typeof item.commit.message === "object" &&
      (item.commit.templates == null ||
        typeof item.commit.templates !== "object")
    ) {
      item.commit.templates = item.commit.message;
    }
    delete item.commit.message;
  }

  if (Array.isArray(item.fields)) {
    item.fields = item.fields.map((field: any) => {
      return resolveComponent(field, componentsMap);
    });
  }

  return item;
};

const normalizeContentEntries = (
  entries: any[],
  componentsMap: Record<string, any>,
): { items: any[]; navigation: NavigationNode[] } => {
  const items: any[] = [];
  const navigation: NavigationNode[] = [];

  entries.forEach((entry: any) => {
    if (entry?.type === "group") {
      const normalizedGroup = normalizeContentEntries(
        entry.items || [],
        componentsMap,
      );
      navigation.push({
        type: "group",
        name: entry.name,
        label: entry.label || entry.name,
        items: normalizedGroup.navigation,
      });
      items.push(...normalizedGroup.items);
      return;
    }

    const normalizedEntry = normalizeContentEntry(entry, componentsMap);
    items.push(normalizedEntry);
    navigation.push({
      type: normalizedEntry.type,
      name: normalizedEntry.name,
      label: normalizedEntry.label || normalizedEntry.name,
    });
  });

  return { items, navigation };
};

// Helper function to resolve component references in fields
function resolveComponent(field: any, componentsMap: Record<string, any>): any {
  let result = JSON.parse(JSON.stringify(field));

  if (result.component && typeof result.component === "string") {
    const componentKey = result.component;
    const componentDef = componentsMap[componentKey];

    if (componentDef) {
      const componentCopy = JSON.parse(JSON.stringify(componentDef));
      const originalName = result.name;
      const componentType = componentCopy.type;
      delete result.component;
      result = mergeWith(
        {},
        componentCopy,
        result,
        (objValue: any, srcValue: any) => {
          if (Array.isArray(srcValue)) {
            return srcValue;
          }
        },
      );
      result.name = originalName;
      result.type = componentType;
    } else {
      console.error(
        `Component reference "${componentKey}" could not be resolved.`,
      );
      delete result.component; // Remove the broken reference
    }
  }

  // Default to `type: object` if fields exist and type is missing
  if (
    Array.isArray(result.fields) &&
    result.fields.length > 0 &&
    result.type === undefined
  ) {
    result.type = "object";
  }

  // Nested fields
  if (Array.isArray(result.fields)) {
    result.fields = result.fields.map((nestedField: any) => {
      return resolveComponent(nestedField, componentsMap);
    });
  }

  // Nested blocks
  if (Array.isArray(result.blocks)) {
    result.blocks = result.blocks.map((block: any) => {
      return resolveComponent(block, componentsMap);
    });
  }

  return result;
}

// Check if the config contains unresolved component references
function containsUnresolvedComponent(data: any): boolean {
  if (Array.isArray(data))
    return data.some((item) => containsUnresolvedComponent(item));
  if (data && typeof data === "object") {
    if (typeof data.component === "string") return true;
    if (Array.isArray(data.fields)) {
      if (containsUnresolvedComponent(data.fields)) return true;
    }
  }
  return false;
}

// Check if the config is valid with the the Zoc schema (lib/configSchema.ts).
// This is used in the settings editor.
const validateConfig = (document: YAML.Document.Parsed) => {
  const content = document.toJSON();
  let errors: any[] = [];

  try {
    ConfigSchema.parse(content);
  } catch (zodError: any) {
    if (zodError instanceof z.ZodError) {
      zodError.errors.forEach((error) => {
        processZodError(error, document, errors);
      });
    }
  }

  return errors;
};

// Process the Zod errors from the validateConfig function. Helps us display errors
// in the settings editor.
const processZodError = (
  error: any,
  document: YAML.Document.Parsed,
  errors: any[],
) => {
  let path = error.path;
  let yamlNode: any = document.getIn(path, true);
  let range = [0, 0];

  switch (error.code) {
    case "invalid_union":
      let invalidUnionCount = 0;
      let invalidUnionMessage = "";
      error.unionErrors.forEach((unionError: any) => {
        unionError.issues.forEach((issue: any) => {
          if (issue.path.length === error.path.length) {
            invalidUnionCount++;
            invalidUnionMessage = issue.message;
          } else {
            processZodError(issue, document, errors);
          }
        });
      });
      if (invalidUnionCount === error.unionErrors.length) {
        // If all entries in the union were invalid types, assume none of the schemas could validate the type.
        yamlNode = document.getIn(error.path, true);
        if (!yamlNode || yamlNode?.range == null) {
          yamlNode = document.getIn(error.path.slice(0, -1), true);
        }
        range = yamlNode && yamlNode.range ? yamlNode.range : [0, 0];
        errors.push({
          code: error.code,
          severity: "error",
          from: range[0] || null,
          to: range[1] || null,
          message: invalidUnionMessage,
        });
      }
      break;

    case "unrecognized_keys":
      error.keys.forEach((key: string) => {
        const parentNode =
          yamlNode &&
          yamlNode.items &&
          yamlNode.items.find((item: any) => item.key.value === key);
        if (parentNode) {
          // TODO: investigate why/when parentNode isn't defined, we may want to leave to YAML parser error
          errors.push({
            severity: "warning",
            from: parentNode.key.range[0] || null,
            to: parentNode.key.range[1] || null,
            message: `Property '${parentNode.key.value}' isn't valid and will be ignored.`,
          });
        }
      });
      break;

    default:
      if (yamlNode?.range == null) {
        path = error.path.slice(0, -1);
        yamlNode = document.getIn(path, true);
      }
      range = yamlNode && yamlNode.range ? yamlNode.range : [0, 0];
      errors.push({
        code: error.code,
        severity: "error",
        from: range[0] || null,
        to: range[1] || null,
        message: error.message,
      });
      break;
  }
};

// Parse the config file and validate it (used in the settings editor).
const parseAndValidateConfig = (content: string) => {
  const { document, errors: parseErrors } = parseConfig(content);
  const validationErrors = validateConfig(document);
  return { document, parseErrors, validationErrors };
};

export {
  configVersion,
  isCacheEnabled,
  isConfigEnabled,
  parseConfig,
  normalizeConfig,
  parseAndValidateConfig,
};
