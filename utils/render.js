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

      // Handle isAdmin condition automatically
      const isAdmin = options.user.role === "admin";
      const isAdminRegex =
        /\{\{#if active\.isAdmin\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(isAdminRegex, isAdmin ? "$1" : "$2");
    }
    if (options.active) {
      // Add isAdmin to active if user exists
      if (options.user && !options.active.hasOwnProperty("isAdmin")) {
        options.active.isAdmin = options.user.role === "admin";
      }

      Object.keys(options.active).forEach((key) => {
        const regex = new RegExp(
          `\\{\\{#if active\\.${key}\\}\\}([\\s\\S]*?)\\{\\{/if\\}\\}`,
          "g"
        );
        if (options.active[key]) {
          layout = layout.replace(regex, "$1");
        } else {
          layout = layout.replace(regex, "");
        }
      });
    } else if (options.user) {
      // If no active but has user, still handle isAdmin
      const isAdmin = options.user.role === "admin";
      const isAdminRegex =
        /\{\{#if active\.isAdmin\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
      layout = layout.replace(isAdminRegex, isAdmin ? "$1" : "$2");
    }

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
