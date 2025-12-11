const fs = require("fs");
const path = require("path");

// Helper function to find matching {{/if}} for a {{#if}} using stack-based approach
// startIndex should be the position after the opening {{#if ...}}
function findConditionBlock(text, startIndex) {
  let depth = 1; // Start at 1 because we're already inside the opening {{#if}}
  let i = startIndex;

  while (i < text.length - 6) {
    // Need at least 7 chars for {{/if}}
    // Check for {{#if (nested condition) - must be at current position
    if (i + 5 <= text.length && text.substring(i, i + 5) === "{{#if") {
      // Find the closing }} of this {{#if ...}}
      let j = i + 5;
      // Skip to the closing }}
      while (j < text.length - 1) {
        if (text[j] === "}" && text[j + 1] === "}") {
          depth++;
          i = j + 2; // Skip past the closing }}
          break;
        }
        j++;
      }
      if (j >= text.length - 1) {
        // Didn't find closing }}, skip this character
        i++;
      }
      continue;
    }

    // Check for {{/if}}
    if (i + 7 <= text.length && text.substring(i, i + 7) === "{{/if}}") {
      depth--;
      if (depth === 0) {
        return i + 7; // Return position after {{/if}}
      }
      i += 7;
      continue;
    }

    i++;
  }
  return -1; // Not found
}

function renderHTML(filePath, options = {}) {
  // Always use layout.html as wrapper if filePath is provided (unless useLayout is explicitly false)
  // If content is provided as string, use it; otherwise read from filePath
  if (options.useLayout !== false) {
    const layoutPath = path.join(__dirname, "..", "views", "layout.html");
    const contentPath = path.join(__dirname, "..", "views", filePath);

    if (!fs.existsSync(layoutPath)) {
      return "<h1>Layout not found</h1>";
    }

    let layout = fs.readFileSync(layoutPath, "utf8");
    let pageContent =
      options.content !== undefined && options.content !== ""
        ? options.content
        : fs.existsSync(contentPath)
        ? fs.readFileSync(contentPath, "utf8")
        : "";

    // Replace template variables
    if (options.title) {
      layout = layout.replace(/\{\{title\}\}/g, options.title);
    }
    if (options.user) {
      layout = layout.replace(/\{\{user\.nama\}\}/g, options.user.nama || "");
      layout = layout.replace(/\{\{user\.role\}\}/g, options.user.role || "");

      // Handle isAdmin condition automatically (with or without else)
      const isAdmin = options.user.role === "admin";
      // Handle with else clause
      const isAdminRegexWithElse =
        /\{\{#if active\.isAdmin\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(isAdminRegexWithElse, isAdmin ? "$1" : "$2");
      // Handle without else clause (will be processed later in active section)

      // Handle isAdminOrPengurus condition automatically (with or without else)
      const isAdminOrPengurus =
        options.user.role === "admin" || options.user.role === "pengurus";
      // Handle with else clause
      const isAdminOrPengurusRegexWithElse =
        /\{\{#if active\.isAdminOrPengurus\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(
        isAdminOrPengurusRegexWithElse,
        isAdminOrPengurus ? "$1" : "$2"
      );
      // Handle without else clause (will be processed later in active section)

      // Handle isUser condition automatically (with or without else)
      const isUser = options.user.role === "user";
      // Handle with else clause
      const isUserRegexWithElse =
        /\{\{#if active\.isUser\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(isUserRegexWithElse, isUser ? "$1" : "$2");
      // Handle without else clause (will be processed later in active section)

      // Handle isTentor condition automatically (with or without else)
      const isTentor = options.user.role === "tentor";
      // Handle with else clause
      const isTentorRegexWithElse =
        /\{\{#if active\.isTentor\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(isTentorRegexWithElse, isTentor ? "$1" : "$2");
      // Handle without else clause (will be processed later in active section)
    }
    if (options.active) {
      // Always add isAdmin, isAdminOrPengurus, isUser, and isTentor to active if user exists
      // This ensures these conditions are always processed
      if (options.user) {
        if (!options.active.hasOwnProperty("isAdmin")) {
          options.active.isAdmin = options.user.role === "admin";
        }
        if (!options.active.hasOwnProperty("isAdminOrPengurus")) {
          options.active.isAdminOrPengurus =
            options.user.role === "admin" || options.user.role === "pengurus";
        }
        if (!options.active.hasOwnProperty("isUser")) {
          options.active.isUser = options.user.role === "user";
        }
        if (!options.active.hasOwnProperty("isTentor")) {
          options.active.isTentor = options.user.role === "tentor";
        }
        if (!options.active.hasOwnProperty("isAdminOrPengurusOrTentor")) {
          options.active.isAdminOrPengurusOrTentor =
            options.user.role === "admin" ||
            options.user.role === "pengurus" ||
            options.user.role === "tentor";
        }
      }

      // Process all conditions - iterate multiple times to handle nested/adjacent conditions
      // Process isAdmin, isUser, and isAdminOrPengurus first (most specific)
      let maxIterations = 10;
      let iteration = 0;
      let previousLayout = "";

      // Priority order: process role-based conditions first
      const priorityKeys = [
        "isAdmin",
        "isUser",
        "isTentor",
        "isAdminOrPengurus",
        "isAdminOrPengurusOrTentor",
      ];
      const otherKeys = Object.keys(options.active).filter(
        (key) => !priorityKeys.includes(key)
      );
      const orderedKeys = [...priorityKeys, ...otherKeys];

      while (iteration < maxIterations && layout !== previousLayout) {
        previousLayout = layout;

        orderedKeys.forEach((key) => {
          if (!options.active.hasOwnProperty(key)) return;

          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const replacements = [];

          // Use regex to find all {{#if active.key}} patterns
          const ifPattern = new RegExp(
            `\\{\\{#if\\s+active\\.${escapedKey}\\}\\}`,
            "g"
          );

          // Collect all matches first
          const matches = [];
          let match;
          ifPattern.lastIndex = 0;
          while ((match = ifPattern.exec(layout)) !== null) {
            matches.push({
              index: match.index,
              length: match[0].length,
            });
          }

          // Process each match from end to start (to maintain positions)
          for (let i = matches.length - 1; i >= 0; i--) {
            const matchInfo = matches[i];
            const startPos = matchInfo.index;
            const endPos = findConditionBlock(
              layout,
              startPos + matchInfo.length
            );

            if (endPos !== -1) {
              const contentStart = startPos + matchInfo.length;
              const contentEnd = endPos - 7; // Subtract {{/if}} length (7 characters)
              const content = layout.substring(contentStart, contentEnd);

              // Apply replacement immediately (from end to start)
              if (options.active[key]) {
                // Keep the content (condition is true) - remove only the {{#if}} and {{/if}} tags
                layout =
                  layout.substring(0, startPos) +
                  content +
                  layout.substring(endPos);
              } else {
                // Remove the entire block including {{#if}} and {{/if}} tags (condition is false)
                layout =
                  layout.substring(0, startPos) + "" + layout.substring(endPos);
              }
            }
          }
        });

        iteration++;
      }

      // Aggressive cleanup: remove any remaining template tags that weren't processed
      // Only remove standalone template tags, not content
      const cleanupPatterns = [
        /\{\{#if\s+active\.[^}]+\}\}/g,
        /\{\{#if\s*active\.[^}]+\s*\}\}/g,
        /\{\{\s*\/if\s*\}\}/g,
        /\{\{\/if\}\}/g,
        /\{\{else\}\}/g,
        /\{\{\s*else\s*\}\}/g,
      ];

      cleanupPatterns.forEach((pattern) => {
        layout = layout.replace(pattern, "");
      });
    } else if (options.user) {
      // If no active but has user, still handle isAdmin, isAdminOrPengurus, and isUser
      const isAdmin = options.user.role === "admin";
      const isAdminOrPengurus =
        options.user.role === "admin" || options.user.role === "pengurus";
      const isUser = options.user.role === "user";

      // Handle with else clause
      const isAdminRegexWithElse =
        /\{\{#if active\.isAdmin\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(isAdminRegexWithElse, isAdmin ? "$1" : "$2");

      const isAdminOrPengurusRegexWithElse =
        /\{\{#if active\.isAdminOrPengurus\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(
        isAdminOrPengurusRegexWithElse,
        isAdminOrPengurus ? "$1" : "$2"
      );

      const isUserRegexWithElse =
        /\{\{#if active\.isUser\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(isUserRegexWithElse, isUser ? "$1" : "$2");

      // Handle without else clause
      const isAdminRegex = /\{\{#if active\.isAdmin\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(isAdminRegex, isAdmin ? "$1" : "");

      const isAdminOrPengurusRegex =
        /\{\{#if active\.isAdminOrPengurus\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(
        isAdminOrPengurusRegex,
        isAdminOrPengurus ? "$1" : ""
      );

      const isUserRegex = /\{\{#if active\.isUser\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(isUserRegex, isUser ? "$1" : "");
    }

    // Final cleanup: remove any remaining template syntax that might have been missed
    // This ensures no template tags leak through to the final HTML
    layout = layout.replace(/\{\{#if[^}]*\}\}/g, "");
    layout = layout.replace(/\{\{\/if\}\}/g, "");
    layout = layout.replace(/\{\{else\}\}/g, "");

    // Inject content
    layout = layout.replace(/\{\{content\}\}/g, pageContent);

    // Inject organisasi data if provided
    if (options.organisasi !== undefined) {
      const organisasiJson = JSON.stringify(options.organisasi || {});
      // Replace all instances of {{organisasi}} in layout
      layout = layout.replace(/\{\{organisasi\}\}/g, organisasiJson);
    }

    // DON'T remove remaining template syntax here - let routes handle it
    // Routes will replace {{users}}, {{anggota}}, {{iuran}}, etc. after renderHTML

    return layout;
  }

  // Direct file rendering
  const fullPath = path.join(__dirname, "..", "views", filePath);

  if (!fs.existsSync(fullPath)) {
    return "<h1>404 - File not found</h1>";
  }

  let content = fs.readFileSync(fullPath, "utf8");

  // Simple template replacement
  if (options.title) {
    content = content.replace(/\{\{title\}\}/g, options.title);
  }
  if (options.user) {
    content = content.replace(/\{\{user\.nama\}\}/g, options.user.nama || "");
  }

  // Remove any remaining template syntax
  content = content.replace(/\{\{[^}]+\}\}/g, "");

  return content;
}

module.exports = { renderHTML };
