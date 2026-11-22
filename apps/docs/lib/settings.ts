/**
 * The docs site's global controls (PRD FR-D1): colour mode, motion theme,
 * density and forced reduced motion. They are the same four switches as
 * Storybook's toolbar and set the same hooks the styles read: shadcn's .dark
 * class, data-motion, data-density and data-motion-reduce, here on <html>.
 *
 * The visual theme switcher joins them once a second theme ships.
 */

export const SETTINGS_KEY = 'nimki-docs-settings'

export const SETTING_OPTIONS = {
  mode: ['light', 'dark'],
  motion: ['expressive', 'subtle'],
  density: ['comfortable', 'compact'],
  reduced: ['off', 'on'],
} as const

type Options = typeof SETTING_OPTIONS
export type SettingName = keyof Options
export type Settings = { [K in SettingName]: Options[K][number] }

export const SETTING_LABELS: Record<SettingName, string> = {
  mode: 'Mode',
  motion: 'Motion',
  density: 'Density',
  reduced: 'Reduced motion',
}

/** Defaults: Subtle motion, as in the library; mode follows the operating system until a reader picks one. */
export function defaultSettings(prefersDark: boolean): Settings {
  return {
    mode: prefersDark ? 'dark' : 'light',
    motion: 'subtle',
    density: 'comfortable',
    reduced: 'off',
  }
}

/** Saved settings, with anything missing or unknown replaced by its default. */
export function parseSettings(saved: string | null, prefersDark: boolean): Settings {
  const settings = defaultSettings(prefersDark)
  if (!saved) return settings
  let value: unknown
  try {
    value = JSON.parse(saved)
  } catch {
    return settings
  }
  if (!value || typeof value !== 'object') return settings
  const record = value as Record<string, unknown>
  for (const name of Object.keys(SETTING_OPTIONS) as SettingName[]) {
    const candidate = record[name]
    if ((SETTING_OPTIONS[name] as readonly unknown[]).includes(candidate)) {
      ;(settings as Record<SettingName, unknown>)[name] = candidate
    }
  }
  return settings
}

/** Sets the class and attributes the styles read. */
export function applySettings(root: HTMLElement, settings: Settings): void {
  root.classList.toggle('dark', settings.mode === 'dark')
  root.style.colorScheme = settings.mode
  root.dataset.motion = settings.motion
  root.dataset.density = settings.density
  if (settings.reduced === 'on') root.dataset.motionReduce = ''
  else delete root.dataset.motionReduce
}

/**
 * Runs in a script in <head>, before the first paint, so a reader's saved
 * settings never flash in after the defaults. Written as a string rather than
 * built with Function.toString(), so what ships is exactly what is tested: a
 * compiler cannot rename anything or add a helper the inline script lacks. It
 * repeats parseSettings and applySettings in plain ES5, and the tests run it
 * against every saved combination to prove the two agree.
 */
export const BOOT_SCRIPT = `(function () {
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)}) || 'null'); } catch (e) {}
  if (!saved || typeof saved !== 'object') saved = {};
  var root = document.documentElement;
  var dark = saved.mode === 'dark' ||
    (saved.mode !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  root.dataset.motion = saved.motion === 'expressive' ? 'expressive' : 'subtle';
  root.dataset.density = saved.density === 'compact' ? 'compact' : 'comfortable';
  if (saved.reduced === 'on') root.dataset.motionReduce = '';
})()`
