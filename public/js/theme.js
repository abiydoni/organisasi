// Theme management
(function () {
  // Check for saved theme preference or default to light mode
  const currentTheme = localStorage.getItem("theme") || "light";

  if (currentTheme === "dark") {
    document.documentElement.classList.add("dark");
  }

  window.toggleTheme = function () {
    const html = document.documentElement;
    html.classList.toggle("dark");

    const theme = html.classList.contains("dark") ? "dark" : "light";
    localStorage.setItem("theme", theme);

    // Update icon
    const themeIcon = document.getElementById("theme-icon");
    if (themeIcon) {
      themeIcon.className =
        theme === "dark" ? "bx bx-sun text-2xl" : "bx bx-moon text-2xl";
    }
  };

  // Initialize theme icon on page load
  document.addEventListener("DOMContentLoaded", function () {
    const themeIcon = document.getElementById("theme-icon");
    if (themeIcon) {
      themeIcon.className =
        currentTheme === "dark" ? "bx bx-sun text-2xl" : "bx bx-moon text-2xl";
    }
  });
})();
