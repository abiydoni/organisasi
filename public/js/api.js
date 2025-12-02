// API helper functions
const API = {
  async request(url, options = {}) {
    try {
      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("API Error Response:", errorText);
        return {
          success: false,
          message: `Error ${response.status}: ${errorText}`,
        };
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        return data;
      } else {
        const text = await response.text();
        return { success: false, message: "Response bukan JSON" };
      }
    } catch (error) {
      console.error("API Error:", error);
      return { success: false, message: "Terjadi kesalahan: " + error.message };
    }
  },

  async get(url) {
    return this.request(url, { method: "GET" });
  },

  async post(url, data) {
    return this.request(url, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async put(url, data) {
    return this.request(url, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async delete(url) {
    return this.request(url, { method: "DELETE" });
  },
};
