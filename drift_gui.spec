# -*- mode: python -*-

block_cipher = None


a = Analysis(['drift_gui.py'],
             pathex=['/Users/rmo/src/drift3'],
             binaries=[],
             datas=[],
             hiddenimports=[],
             hookspath=[],
             runtime_hooks=[],
             excludes=[],
             win_no_prefer_redirects=False,
             win_private_assemblies=False,
             cipher=block_cipher,
             noarchive=False)
pyz = PYZ(a.pure, a.zipped_data,
             cipher=block_cipher)
exe = EXE(pyz,
          a.scripts,
          [],
          exclude_binaries=True,
          name='drift_gui',
          debug=False,
          bootloader_ignore_signals=False,
          strip=False,
          upx=True,
          console=False )
coll = COLLECT(exe,
               a.binaries,
               a.zipfiles,
               a.datas,
               strip=False,
               upx=True,
               name='drift_gui')
app = BUNDLE(coll,
             name='drift_gui.app',
             icon='drift3.icns',
             bundle_identifier=None,
             info_plist={
                 'NSHighResolutionCapable': 'True'
             })
