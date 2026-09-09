export const WINDOWS_UIA_PROBE = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [System.Windows.Automation.AutomationElement]::RootElement
if ($null -eq $root) { throw 'UI Automation root element is unavailable' }
[Console]::Out.Write('{"available":true}')
`;

export const WINDOWS_UIA_WORKER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Q1XNative {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$MOUSEEVENTF_RIGHTDOWN = 0x0008
$MOUSEEVENTF_RIGHTUP = 0x0010
$MOUSEEVENTF_MIDDLEDOWN = 0x0020
$MOUSEEVENTF_MIDDLEUP = 0x0040
$MOUSEEVENTF_WHEEL = 0x0800
$MOUSEEVENTF_HWHEEL = 0x01000

function Get-Root { return [System.Windows.Automation.AutomationElement]::RootElement }

function Get-TopWindows {
  $root = Get-Root
  return $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
}

function Get-ProcessName([int]$pid) {
  try { return (Get-Process -Id $pid -ErrorAction Stop).ProcessName } catch { return $null }
}

function Describe-Element($element) {
  if ($null -eq $element) { return $null }
  $rect = $element.Current.BoundingRectangle
  return [ordered]@{
    name = $element.Current.Name
    automationId = $element.Current.AutomationId
    className = $element.Current.ClassName
    role = $element.Current.ControlType.ProgrammaticName
    processId = $element.Current.ProcessId
    nativeWindowHandle = $element.Current.NativeWindowHandle
    enabled = $element.Current.IsEnabled
    offscreen = $element.Current.IsOffscreen
    bounds = [ordered]@{ x = $rect.X; y = $rect.Y; width = $rect.Width; height = $rect.Height }
  }
}

function Matches-Text($actual, $expected, [bool]$exact) {
  if ($null -eq $actual -or $null -eq $expected) { return $false }
  $a = [string]$actual
  $e = [string]$expected
  if ($exact) { return [string]::Equals($a, $e, [System.StringComparison]::OrdinalIgnoreCase) }
  return $a.IndexOf($e, [System.StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Matches-Target($element, $target) {
  if ($null -eq $target) { return $true }
  switch ([string]$target.by) {
    'accessibility-id' { return Matches-Text $element.Current.AutomationId ([string]$target.value) $true }
    'name' { return Matches-Text $element.Current.Name ([string]$target.value) ([bool]$target.exact) }
    'text' {
      if (Matches-Text $element.Current.Name ([string]$target.value) ([bool]$target.exact)) { return $true }
      try {
        $pattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $pattern -and (Matches-Text $pattern.Current.Value ([string]$target.value) ([bool]$target.exact))) { return $true }
      } catch {}
      return $false
    }
    'role' {
      $role = [string]$element.Current.ControlType.ProgrammaticName
      if (-not (Matches-Text $role ([string]$target.role) $false)) { return $false }
      if ($target.name) { return Matches-Text $element.Current.Name ([string]$target.name) ([bool]$target.exact) }
      return $true
    }
    'path' { return $false }
    default { return $false }
  }
}

function Find-ApplicationWindow($application) {
  if (-not $application) { return $null }
  foreach ($window in (Get-TopWindows)) {
    $processName = Get-ProcessName $window.Current.ProcessId
    if ((Matches-Text $processName $application $true) -or (Matches-Text $window.Current.Name $application $false)) { return $window }
  }
  return $null
}

function Find-Element($root, $target) {
  if ($null -eq $root) { return $null }
  if (Matches-Target $root $target) { return $root }
  $queue = New-Object System.Collections.Generic.Queue[object]
  $walker = [System.Windows.Automation.TreeWalker]::RawViewWalker
  $child = $walker.GetFirstChild($root)
  while ($null -ne $child) { $queue.Enqueue($child); $child = $walker.GetNextSibling($child) }
  $visited = 0
  while ($queue.Count -gt 0 -and $visited -lt 5000) {
    $node = $queue.Dequeue(); $visited++
    if (Matches-Target $node $target) { return $node }
    $child = $walker.GetFirstChild($node)
    while ($null -ne $child) { $queue.Enqueue($child); $child = $walker.GetNextSibling($child) }
  }
  return $null
}

function Resolve-Element($action) {
  $root = if ($action.application) { Find-ApplicationWindow $action.application } else { Get-Root }
  if ($null -eq $root) { throw "application/window not found: $($action.application)" }
  if ($null -eq $action.target) { return $root }
  $element = Find-Element $root $action.target
  if ($null -eq $element) { throw 'UI Automation target not found' }
  return $element
}

function Click-Point([double]$x, [double]$y, [string]$button = 'left', [bool]$double = $false) {
  [Q1XNative]::SetCursorPos([int]$x, [int]$y) | Out-Null
  $down = $MOUSEEVENTF_LEFTDOWN; $up = $MOUSEEVENTF_LEFTUP
  if ($button -eq 'right') { $down = $MOUSEEVENTF_RIGHTDOWN; $up = $MOUSEEVENTF_RIGHTUP }
  elseif ($button -eq 'middle') { $down = $MOUSEEVENTF_MIDDLEDOWN; $up = $MOUSEEVENTF_MIDDLEUP }
  $count = if ($double) { 2 } else { 1 }
  for ($i = 0; $i -lt $count; $i++) {
    [Q1XNative]::mouse_event([uint32]$down, 0, 0, 0, [UIntPtr]::Zero)
    [Q1XNative]::mouse_event([uint32]$up, 0, 0, 0, [UIntPtr]::Zero)
    if ($double) { Start-Sleep -Milliseconds 60 }
  }
}

function Invoke-Click($element, [bool]$double = $false) {
  if (-not $double) {
    try {
      $pattern = $element.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
      if ($null -ne $pattern) { $pattern.Invoke(); return }
    } catch {}
  }
  $rect = $element.Current.BoundingRectangle
  if ($rect.Width -le 0 -or $rect.Height -le 0) { throw 'target has no clickable bounds' }
  Click-Point ($rect.X + ($rect.Width / 2)) ($rect.Y + ($rect.Height / 2)) 'left' $double
}

function Send-Key([string]$key) {
  $map = @{
    'enter' = '{ENTER}'; 'tab' = '{TAB}'; 'escape' = '{ESC}'; 'esc' = '{ESC}';
    'backspace' = '{BACKSPACE}'; 'delete' = '{DELETE}'; 'up' = '{UP}'; 'down' = '{DOWN}';
    'left' = '{LEFT}'; 'right' = '{RIGHT}'; 'home' = '{HOME}'; 'end' = '{END}';
    'pageup' = '{PGUP}'; 'pagedown' = '{PGDN}'; 'space' = ' '
  }
  $token = $map[$key.ToLowerInvariant()]
  if ($null -eq $token) { $token = $key }
  [System.Windows.Forms.SendKeys]::SendWait($token)
}

function Execute-Action($action) {
  switch ([string]$action.kind) {
    'list-applications' {
      $items = @()
      foreach ($window in (Get-TopWindows)) {
        $name = Get-ProcessName $window.Current.ProcessId
        if ($name) { $items += [ordered]@{ process = $name; window = $window.Current.Name; processId = $window.Current.ProcessId } }
      }
      return $items
    }
    'launch-application' {
      if (-not $action.application) { throw 'application is required' }
      $args = @(); if ($action.arguments) { $args = @($action.arguments) }
      $process = Start-Process -FilePath ([string]$action.application) -ArgumentList $args -PassThru
      return [ordered]@{ processId = $process.Id; application = $action.application }
    }
    'focus-application' {
      $element = Find-ApplicationWindow $action.application
      if ($null -eq $element) { throw 'application window not found' }
      $element.SetFocus(); if ($element.Current.NativeWindowHandle) { [Q1XNative]::SetForegroundWindow([IntPtr]$element.Current.NativeWindowHandle) | Out-Null }
      return Describe-Element $element
    }
    'close-application' {
      $element = Find-ApplicationWindow $action.application
      if ($null -eq $element) { throw 'application window not found' }
      $process = Get-Process -Id $element.Current.ProcessId -ErrorAction Stop
      $process.CloseMainWindow() | Out-Null
      return [ordered]@{ processId = $process.Id }
    }
    'list-windows' {
      $items = @()
      foreach ($window in (Get-TopWindows)) {
        $processName = Get-ProcessName $window.Current.ProcessId
        if (-not $action.application -or (Matches-Text $processName $action.application $true)) { $items += (Describe-Element $window) }
      }
      return $items
    }
    'focus-window' {
      $element = Find-ApplicationWindow $action.application
      if ($null -eq $element) { throw 'window not found' }
      if ($action.windowId) {
        foreach ($window in (Get-TopWindows)) {
          if ([string]$window.Current.NativeWindowHandle -eq [string]$action.windowId -or $window.Current.AutomationId -eq [string]$action.windowId -or $window.Current.Name -eq [string]$action.windowId) { $element = $window; break }
        }
      }
      $element.SetFocus(); if ($element.Current.NativeWindowHandle) { [Q1XNative]::SetForegroundWindow([IntPtr]$element.Current.NativeWindowHandle) | Out-Null }
      return Describe-Element $element
    }
    'inspect' { return Describe-Element (Resolve-Element $action) }
    'find' { return Describe-Element (Resolve-Element $action) }
    'click' { Invoke-Click (Resolve-Element $action) $false; return @{} }
    'double-click' { Invoke-Click (Resolve-Element $action) $true; return @{} }
    'type' {
      if ($action.target) { (Resolve-Element $action).SetFocus() }
      [System.Windows.Forms.SendKeys]::SendWait([string]$action.text)
      return [ordered]@{ characters = ([string]$action.text).Length }
    }
    'press' { if ($action.target) { (Resolve-Element $action).SetFocus() }; Send-Key ([string]$action.key); return [ordered]@{ key = $action.key } }
    'set-value' {
      $element = Resolve-Element $action
      $pattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
      if ($null -eq $pattern) { throw 'target does not support ValuePattern' }
      $pattern.SetValue([string]$action.value); return @{}
    }
    'select' {
      $element = Resolve-Element $action
      $pattern = $element.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
      if ($null -eq $pattern) { throw 'target does not support SelectionItemPattern' }
      $pattern.Select(); return @{}
    }
    'toggle' {
      $element = Resolve-Element $action
      $pattern = $element.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
      if ($null -eq $pattern) { throw 'target does not support TogglePattern' }
      $pattern.Toggle(); return [ordered]@{ state = [string]$pattern.Current.ToggleState }
    }
    'mouse-move' { [Q1XNative]::SetCursorPos([int]$action.x, [int]$action.y) | Out-Null; return @{} }
    'mouse-down' {
      [Q1XNative]::SetCursorPos([int]$action.x, [int]$action.y) | Out-Null
      $flag = if ($action.button -eq 'right') { $MOUSEEVENTF_RIGHTDOWN } elseif ($action.button -eq 'middle') { $MOUSEEVENTF_MIDDLEDOWN } else { $MOUSEEVENTF_LEFTDOWN }
      [Q1XNative]::mouse_event([uint32]$flag,0,0,0,[UIntPtr]::Zero); return @{}
    }
    'mouse-up' {
      [Q1XNative]::SetCursorPos([int]$action.x, [int]$action.y) | Out-Null
      $flag = if ($action.button -eq 'right') { $MOUSEEVENTF_RIGHTUP } elseif ($action.button -eq 'middle') { $MOUSEEVENTF_MIDDLEUP } else { $MOUSEEVENTF_LEFTUP }
      [Q1XNative]::mouse_event([uint32]$flag,0,0,0,[UIntPtr]::Zero); return @{}
    }
    'wheel' {
      if ($action.deltaY) { [Q1XNative]::mouse_event([uint32]$MOUSEEVENTF_WHEEL,0,0,[int]$action.deltaY,[UIntPtr]::Zero) }
      if ($action.deltaX) { [Q1XNative]::mouse_event([uint32]$MOUSEEVENTF_HWHEEL,0,0,[int]$action.deltaX,[UIntPtr]::Zero) }
      return @{}
    }
    'drag' {
      if ($null -eq $action.x -or $null -eq $action.y -or $null -eq $action.width -or $null -eq $action.height) { throw 'drag requires x/y and width/height as destination delta' }
      [Q1XNative]::SetCursorPos([int]$action.x,[int]$action.y) | Out-Null
      [Q1XNative]::mouse_event([uint32]$MOUSEEVENTF_LEFTDOWN,0,0,0,[UIntPtr]::Zero)
      [Q1XNative]::SetCursorPos([int]($action.x + $action.width),[int]($action.y + $action.height)) | Out-Null
      [Q1XNative]::mouse_event([uint32]$MOUSEEVENTF_LEFTUP,0,0,0,[UIntPtr]::Zero); return @{}
    }
    'wait' { Start-Sleep -Milliseconds ([int]$action.milliseconds); return @{} }
    'screenshot' {
      if (-not $action.outputPath) { throw 'screenshot requires outputPath' }
      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CopyFromScreen($bounds.Left,$bounds.Top,0,0,$bitmap.Size)
        $bitmap.Save([string]$action.outputPath,[System.Drawing.Imaging.ImageFormat]::Png)
      } finally { $graphics.Dispose(); $bitmap.Dispose() }
      return [ordered]@{ outputPath = $action.outputPath }
    }
    default { throw "unsupported Windows desktop action: $($action.kind)" }
  }
}

$raw = [Console]::In.ReadToEnd()
$envelope = $raw | ConvertFrom-Json
$startedAt = [DateTime]::UtcNow.ToString('o')
$results = @()
$successCount = 0
foreach ($action in @($envelope.batch.actions)) {
  $watch = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $output = Execute-Action $action
    $watch.Stop(); $successCount++
    $results += [ordered]@{ id = $action.id; status = 'succeeded'; durationMs = [int]$watch.ElapsedMilliseconds; output = $output }
  } catch {
    $watch.Stop()
    $message = [string]$_.Exception.Message
    $code = if ($message -match 'access|denied|privilege|elevat') { 'WINDOWS_ELEVATED_TARGET_BLOCKED' } else { 'WINDOWS_ACTION_FAILED' }
    $results += [ordered]@{ id = $action.id; status = 'failed'; durationMs = [int]$watch.ElapsedMilliseconds; error = [ordered]@{ code = $code; message = $message.Substring(0,[Math]::Min(512,$message.Length)) } }
    if ($envelope.batch.stopOnError -ne $false) { break }
  }
}
$status = if ($results.Count -eq 0 -or $successCount -eq $results.Count) { 'succeeded' } elseif ($successCount -eq 0) { 'failed' } else { 'partial' }
$result = [ordered]@{
  contractVersion = '1.0.0'
  id = ([string]$envelope.batch.id + '.result')
  batchId = [string]$envelope.batch.id
  status = $status
  actions = $results
  startedAt = $startedAt
  finishedAt = [DateTime]::UtcNow.ToString('o')
  metadata = [ordered]@{ bridge = 'q1x-windows-uiautomation' }
}
[Console]::Out.Write(($result | ConvertTo-Json -Compress -Depth 10))
`;
