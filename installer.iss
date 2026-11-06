; ChemStore Pro - Inno Setup script
; Build with: ISCC.exe installer.iss

#define MyAppName "ChemStore Pro"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "ChemStore Pro"
#define MyAppExeName "app.exe"

[Setup]
AppId={{F37FDD33-AEB5-40CF-9809-9EC133158CA3}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=installer
OutputBaseFilename=ChemStorePro-Setup-{#MyAppVersion}
SetupIconFile=app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
ShowLanguageDialog=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[InstallDelete]
; Remove stale bundled files on upgrade, but keep warehouse.db and uploads.
Type: filesandordirs; Name: "{app}\_internal"

[Files]
Source: "dist\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Runtime data (warehouse.db, .secret_key, static\uploads) is intentionally kept.
Type: dirifempty; Name: "{app}"
