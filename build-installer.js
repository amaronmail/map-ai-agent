const path = require("path");
const fs = require("fs");
const electronInstaller = require("electron-winstaller");

const inputDirectory = path.join(__dirname, "dist", "MapAI-Agent-win32-x64");
const outputDirectory = path.join(__dirname, "dist", "installer");

if (!fs.existsSync(inputDirectory)) {
  console.error("Input directory does not exist:", inputDirectory);
  process.exit(1);
}

const options = {
  appDirectory: inputDirectory,
  outputDirectory: outputDirectory,
  authors: "MapAI-Agent",
  exe: "MapAI-Agent.exe",
  setupExe: "MapAI-Agent-Setup.exe",
  title: "MapAI-Agent",
  noMsi: true,
  description: "MapAI-Agent desktop app",
};

console.log("Creating installer...");

electronInstaller.createWindowsInstaller(options)
  .then(() => {
    console.log("Installer created successfully in", outputDirectory);
  })
  .catch((err) => {
    console.error("Error creating installer:", err);
    process.exit(1);
  });
