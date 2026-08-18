const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

function handleSquirrelEvent() {
  if (process.platform !== "win32" || process.argv.length === 1) {
    return false;
  }

  const squirrelEvent = process.argv[1];
  const appFolder = path.resolve(process.execPath, "..");
  const rootFolder = path.resolve(appFolder, "..");
  const updateExe = path.join(rootFolder, "Update.exe");
  const exeName = path.basename(process.execPath);

  const spawnUpdate = (args) => {
    try {
      return spawn(updateExe, args, { detached: true });
    } catch (e) {
      return null;
    }
  };

  switch (squirrelEvent) {
    case "--squirrel-install":
    case "--squirrel-updated":
      spawnUpdate(["--createShortcut", exeName]);
      setTimeout(() => app.quit(), 1000);
      return true;

    case "--squirrel-uninstall":
      spawnUpdate(["--removeShortcut", exeName]);
      setTimeout(() => app.quit(), 1000);
      return true;

    case "--squirrel-obsolete":
      app.quit();
      return true;

    default:
      return false;
  }
}

if (handleSquirrelEvent()) {
  return;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL("http://localhost:3000");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("ready", () => {
  require(path.join(__dirname, "server.js"));
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
