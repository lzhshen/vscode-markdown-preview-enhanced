import * as vscode from 'vscode';

/**
 * Screen fullscreen for the mermaid zoom overlay (media/mermaid-zoom.js).
 * Webviews may not use the Fullscreen API, so the extension enters zen mode
 * (fullscreen by default, see `zenMode.fullScreen`) and maximizes the
 * preview's editor group while the overlay is open.
 */
let active = false;
let maximizedGroup = false;
// Zen mode still shows the tab bar and, in native fullscreen, the custom
// title bar; both can only be hidden through settings. Apply them for the
// lifetime of the overlay and put the user's own values back afterwards
// (including "not set").
const FULLSCREEN_SETTINGS: [section: string, key: string, value: string][] = [
  ['zenMode', 'showTabs', 'none'],
  ['window', 'customTitleBarVisibility', 'windowed'],
];
let savedSettings: [section: string, key: string, value: unknown][] = [];

async function run(command: string) {
  try {
    await vscode.commands.executeCommand(command);
  } catch (error) {
    console.error(`[mermaid-zoom] ${command} failed`, error);
  }
}

// Focusing the panel makes its group the active one, which is the group the
// maximize command acts on, and keeps keyboard input (Escape) in the webview.
function focusPanel(panel: vscode.WebviewPanel) {
  try {
    panel.reveal(panel.viewColumn, false);
  } catch {
    // Disposed panel: nothing to focus.
  }
}

async function applyFullscreenSettings() {
  for (const [section, key, value] of FULLSCREEN_SETTINGS) {
    const config = vscode.workspace.getConfiguration(section);
    const inspected = config.inspect(key);
    if (
      config.get(key) === value ||
      // A workspace value would override ours; leave it alone.
      inspected?.workspaceValue !== undefined ||
      inspected?.workspaceFolderValue !== undefined
    ) {
      continue;
    }
    try {
      await config.update(key, value, vscode.ConfigurationTarget.Global);
      savedSettings.push([section, key, inspected?.globalValue]);
    } catch (error) {
      console.error(`[mermaid-zoom] setting ${section}.${key} failed`, error);
    }
  }
}

async function restoreFullscreenSettings() {
  const saved = savedSettings;
  savedSettings = [];
  for (const [section, key, value] of saved) {
    try {
      await vscode.workspace
        .getConfiguration(section)
        .update(key, value, vscode.ConfigurationTarget.Global);
    } catch (error) {
      console.error(`[mermaid-zoom] restoring ${section}.${key} failed`, error);
    }
  }
}

export async function setMermaidScreenFullscreen(
  enter: unknown,
  panel?: vscode.WebviewPanel,
) {
  if (enter === true && !active && panel) {
    active = true;
    // Maximize before zen mode (and restore after leaving it) so the group
    // sizes are saved and restored at the same window size.
    maximizedGroup = vscode.window.tabGroups.all.length > 1;
    focusPanel(panel);
    if (maximizedGroup) {
      await run('workbench.action.toggleMaximizeEditorGroup');
    }
    await applyFullscreenSettings();
    await run('workbench.action.toggleZenMode');
    // Zen mode centers a lone editor at a reading width; the diagram should
    // use the whole screen. Exiting zen mode restores the centered layout.
    if (vscode.workspace.getConfiguration('zenMode').get('centerLayout')) {
      await run('workbench.action.toggleCenteredLayout');
    }
  } else if (enter === false && active) {
    active = false;
    await run('workbench.action.exitZenMode');
    // The maximized group is the only visible one, so it is still active;
    // refocusing the panel here would steal focus from the overlay's trigger.
    if (maximizedGroup) {
      maximizedGroup = false;
      // Leaving native fullscreen animates the window back; restoring the
      // group sizes mid-animation lays them out for the wrong width.
      if (vscode.workspace.getConfiguration('zenMode').get('fullScreen')) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      await run('workbench.action.toggleMaximizeEditorGroup');
    }
    await restoreFullscreenSettings();
  }
}
