// Script untuk generate icon PWA dari SVG menggunakan sharp
// Jalankan dengan: node public/icons/generate-icons.js

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// Path ke SVG icon
const svgPath = path.join(__dirname, "icon.svg");
const outputDir = __dirname;

// Ukuran icon yang diperlukan untuk PWA
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  try {
    // Check if SVG exists
    if (!fs.existsSync(svgPath)) {
      console.error("SVG icon not found:", svgPath);
      console.log("Please create icon.svg first");
      return;
    }

    console.log("Generating PWA icons from SVG...\n");

    // Generate icons for each size
    for (const size of iconSizes) {
      const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);

      await sharp(svgPath)
        .resize(size, size, {
          fit: "contain",
          background: { r: 59, g: 130, b: 246, alpha: 1 }, // Blue background
        })
        .png()
        .toFile(outputPath);

      console.log(`✓ Generated: icon-${size}x${size}.png`);
    }

    console.log("\n✅ All icons generated successfully!");
    console.log(`Icons location: ${outputDir}`);
  } catch (error) {
    console.error("Error generating icons:", error);
    console.log("\nNote: If sharp is not installed, run: npm install sharp");
  }
}

// Run the generator
generateIcons();
