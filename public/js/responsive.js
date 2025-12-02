// Responsive table helper
function makeTableResponsive(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;

  // Wrap table in scrollable container
  const wrapper = document.createElement("div");
  wrapper.className = "overflow-x-auto";
  wrapper.style.maxWidth = "100%";

  table.parentNode.insertBefore(wrapper, table);
  wrapper.appendChild(table);
}

// Make all tables responsive on page load
document.addEventListener("DOMContentLoaded", function () {
  const tables = document.querySelectorAll("table");
  tables.forEach((table) => {
    if (!table.parentElement.classList.contains("overflow-x-auto")) {
      const wrapper = document.createElement("div");
      wrapper.className = "overflow-x-auto -mx-3 md:mx-0";
      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
});
