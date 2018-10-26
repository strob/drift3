'use strict'

import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import { format as formatUrl } from 'url'

const { spawn } = require('child_process');

const isDevelopment = process.env.NODE_ENV !== 'production'

// global reference to mainWindow (necessary to prevent window from being garbage collected)
let mainWindow

function createMainWindow() {
    const window = new BrowserWindow({
	title: "Drift",
	frame: true,
	// backgroundColor: 'white',
	movable: true
    })

  if (isDevelopment) {
    window.webContents.openDevTools()
  }

    // XXX: TIMEOUT
    setTimeout(() => {
	window.loadURL('http://localhost:9899');
    }, 2000);

  window.on('closed', () => {
    mainWindow = null
  })

  window.webContents.on('devtools-opened', () => {
    window.focus()
    setImmediate(() => {
      window.focus()
    })
  })

  return window
}

// quit application when all windows are closed
app.on('window-all-closed', () => {
  // on macOS it is common for applications to stay open until the user explicitly quits
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // on macOS it is common to re-create a window even after all windows have been closed
  if (mainWindow === null) {
    mainWindow = createMainWindow()
  }
})


var serveDir = '';//server/serve-dist/';
if(!isDevelopment) {
    serveDir = __dirname + '/' + serveDir;
}
    const server = spawn('./serve', [], {cwd: serveDir});

    server.stdout.on('data', (data) => {
	if(isDevelopment) {
	    console.log(`stdout: ${data}`);
	}
    });
    server.stderr.on('data', (data) => {
	if(isDevelopment) {
	    console.log(`stderr: ${data}`);
	}
    });

    app.on('will-quit', () => {
	console.log("WAC - killing server");
	server.kill();
    })


// create main BrowserWindow when electron is ready
app.on('ready', () => {
  mainWindow = createMainWindow()
})
