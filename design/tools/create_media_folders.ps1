# Creates the BUNKER media folder structure (media is not stored in git, ART-10).
# Run in PowerShell:  powershell -ExecutionPolicy Bypass -File create_media_folders.ps1
# Optional: -Root "D:\Other\bunker-media"
param([string]$Root = 'E:\Projects\bunker-media')
$dirs = @(
  'references\traces\incoming\texturelabs', 'references\traces\incoming\pinterest', 'references\traces\incoming\other',
  'references\traces\library\paper_base', 'references\traces\library\fold', 'references\traces\library\crumple',
  'references\traces\library\corner', 'references\traces\library\staple_clip', 'references\traces\library\punch',
  'references\traces\library\pin_tape', 'references\traces\library\stain', 'references\traces\library\pencil_indent',
  'references\traces\library\stamp', 'references\traces\library\toner_copy', 'references\traces\library\yellowing',
  'references\traces\library\graphite_ink', 'references\traces\library\carbon_copy', 'references\traces\library\burn',
  'references\traces\library\tear', 'references\traces\library\cardboard',
  'references\traces\generated',
  'references\documents', 'references\style', 'references\places', 'references\characters',
  'references\objects', 'references\video', 'references\audio', 'references\brands',
  'palette', 'probes',
  'assets\01_documents', 'assets\02_handwriting', 'assets\03_case_packaging', 'assets\04_photos',
  'assets\05_plans', 'assets\06_newspapers', 'assets\07_evidence_3d', 'assets\08_investigator_room',
  'assets\09_device_ui', 'assets\10_sites', 'assets\11_video', 'assets\12_audio', 'assets\13_brands',
  'assets\14_characters', 'assets\15_game_ui',
  'blender'
)
foreach ($d in $dirs) { New-Item -ItemType Directory -Force -Path (Join-Path $Root $d) | Out-Null }
Write-Host "Created $($dirs.Count) folders in $Root"
explorer $Root
