// The notifications are an optional permission: asked when the user turns them on, given up when they turn them off. Nothing
// about the browser is touched before that.
const PERMISSIONS = { permissions: ['notifications'] as const }

export async function requestNotifications(): Promise<boolean> {
  try {
    return await browser.permissions.request({ permissions: [...PERMISSIONS.permissions] })
  } catch {
    return false
  }
}

export async function dropNotifications(): Promise<void> {
  try {
    await browser.permissions.remove({ permissions: [...PERMISSIONS.permissions] })
  } catch {
    // Nothing to drop.
  }
}
