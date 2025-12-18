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

    // Update icon dengan warna yang sesuai
    const themeIcon = document.getElementById("theme-icon");
    if (themeIcon) {
      if (theme === "dark") {
        // Dark mode aktif, tampilkan ikon matahari (untuk switch ke light)
        themeIcon.className = "bx bx-sun text-xl md:text-2xl text-yellow-400 dark:text-yellow-300";
      } else {
        // Light mode aktif, tampilkan ikon bulan (untuk switch ke dark)
        themeIcon.className = "bx bx-moon text-xl md:text-2xl text-gray-700 dark:text-gray-300";
      }
    }
  };

  // Initialize theme icon on page load
  document.addEventListener("DOMContentLoaded", function () {
    const themeIcon = document.getElementById("theme-icon");
    if (themeIcon) {
      if (currentTheme === "dark") {
        // Dark mode aktif, tampilkan ikon matahari (untuk switch ke light)
        themeIcon.className = "bx bx-sun text-xl md:text-2xl text-yellow-400 dark:text-yellow-300";
      } else {
        // Light mode aktif, tampilkan ikon bulan (untuk switch ke dark)
        themeIcon.className = "bx bx-moon text-xl md:text-2xl text-gray-700 dark:text-gray-300";
      }
    }
  });
})();
