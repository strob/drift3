#!/usr/bin/env python3

from PyQt5 import QtWidgets, QtCore
from PyQt5.QtCore import pyqtSignal

import logging
import os
import subprocess
import threading
import webbrowser
import sys

__version__="3.0"

def get_open_port(desired=0):
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("",desired))
    except socket.error:
        return get_open_port(0)
    s.listen(1)
    port = s.getsockname()[1]
    s.close()
    return port

PORT = get_open_port(9899)

def get_binary(name):
    if hasattr(sys, "frozen"):
        return os.path.abspath(os.path.join(getattr(sys, '_MEIPASS', ''), os.pardir, 'Resources', name))

    return name

def get_cwd():
    if hasattr(sys, "frozen"):
        return os.path.abspath(os.path.join(getattr(sys, '_MEIPASS', ''), os.pardir, 'Resources'))

    return ''

S_PROC = None
G_PROC = None

devnull = None#open(os.devnull, 'w')

def serve(port):
    global S_PROC
    S_PROC = subprocess.Popen(['./serve', str(port)],
                              cwd=os.path.join(get_cwd(), 'serve-dist'),
                              stdout=devnull,
                              stderr=devnull)

gentle_running = get_open_port(8765) != 8765

# Start a thread for the web server.
webthread = threading.Thread(target=serve, args=(PORT,))
webthread.start()
print("Starting server...")

def open_browser():
    webbrowser.open("http://localhost:%d/" % (PORT))

def open_about():
    webbrowser.open("https://rmozone.com/drift")

def open_gentle():
    webbrowser.open("https://lowerquality.com/gentle")

app = QtWidgets.QApplication(sys.argv)

w = QtWidgets.QWidget()
w.resize(250, 150)
w.setWindowTitle('drift3')

def quit_server():
    app.exit()

layout = QtWidgets.QVBoxLayout()
w.setLayout(layout)

txt = QtWidgets.QLabel('''Drift v%s

Words and intonation.''' % (__version__))
layout.addWidget(txt)

if not gentle_running:
    gtxt = QtWidgets.QLabel('''Gentle is not running.
Please install and run Gentle before running Drift.''')
    layout.addWidget(gtxt)

    gbtn = QtWidgets.QPushButton('Download Gentle')
    gbtn.setStyleSheet("font-weight: bold;")
    layout.addWidget(gbtn)
    gbtn.clicked.connect(open_gentle)
else:
    btn = QtWidgets.QPushButton('Open in browser')
    btn.setStyleSheet("font-weight: bold;")
    layout.addWidget(btn)
    btn.clicked.connect(open_browser)

abt = QtWidgets.QPushButton('About Drift')
layout.addWidget(abt)
abt.clicked.connect(open_about)

quitb = QtWidgets.QPushButton('Quit')
layout.addWidget(quitb)
quitb.clicked.connect(quit_server)

w.show()

w.raise_()
w.activateWindow()

app.exec_()

logging.info("Waiting for server to quit.")
S_PROC.kill()
S_PROC.wait()
