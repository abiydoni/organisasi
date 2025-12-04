const fs = require("fs");
const path = require("path");

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
    }
    if (options.active) {
      // Always add isAdmin, isAdminOrPengurus, and isUser to active if user exists
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
      }

      // Process all conditions - iterate multiple times to handle nested/adjacent conditions
      let maxIterations = 10;
      let iteration = 0;
      let previousLayout = "";

      while (iteration < maxIterations && layout !== previousLayout) {
        previousLayout = layout;

        Object.keys(options.active).forEach((key) => {
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          // Match with flexible whitespace - handle all variations
          // Pattern: {{#if active.xxx}}...{{/if}} or {{#if active.xxx }}...{{/if}}
          // Use a more flexible pattern that matches the exact format in layout.html
          // Format: {{#if active.xxx}}...{{/if}}
          const regex = new RegExp(
            `\\{\\{#if\\s+active\\.${escapedKey}\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`,
            "g"
          );

          if (options.active[key]) {
            layout = layout.replace(regex, "$1");
          } else {
            layout = layout.replace(regex, "");
          }
        });

        iteration++;
      }

      // Aggressive cleanup: remove any remaining template tags
      // Try multiple patterns to catch all variations
      const cleanupPatterns = [
        /\{\{#if\s+active\.[^}]+\}\}/g,
        /\{\{#if\s*active\.[^}]+\s*\}\}/g,
        /\{\{#if\s*active\.[^}]*\}\}/g,
        /\{\{\s*\/if\s*\}\}/g,
        /\{\{\/if\}\}/g,
        /\{\{#if[^}]*\}\}/g,
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
