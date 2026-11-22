/**
 * The component audit (master plan step 1.4c): every value a component in the
 * Figma file shows comes from a token. Read through the REST API, from every
 * page that holds a component. Inside each component, and in each instance's
 * own properties, it fails:
 *
 * - a visible solid fill or stroke not bound to a colour variable, and any
 *   gradient or image paint;
 * - a corner radius above zero not bound to a variable;
 * - an auto layout gap or padding above zero not bound to a variable (a
 *   space-between gap is worked out by Figma and skipped);
 * - text without a text style;
 * - a visible effect without an effect style.
 *
 * Sizes and stroke widths are not checked: heights bind to density tokens
 * where the component's brief says so, and the rest are Tailwind's fixed sizes,
 * which the binding check compares with the component's code.
 */

/** A node as the REST API returns it, reduced to what the audit reads. */
export interface AuditNode {
  id: string
  name: string
  type: string
  visible?: boolean
  children?: AuditNode[]
  fills?: Paint[]
  strokes?: Paint[]
  cornerRadius?: number
  rectangleCornerRadii?: number[]
  layoutMode?: string
  primaryAxisAlignItems?: string
  layoutWrap?: string
  itemSpacing?: number
  counterAxisSpacing?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  effects?: { type: string; visible?: boolean }[]
  styles?: Record<string, string>
  boundVariables?: Record<string, unknown>
}

interface Paint {
  type: string
  visible?: boolean
}

/** Each corner in rectangleCornerRadii's order, as the plugin API and the REST API name its binding. */
const CORNERS = [
  ['topLeftRadius', 'RECTANGLE_TOP_LEFT_CORNER_RADIUS'],
  ['topRightRadius', 'RECTANGLE_TOP_RIGHT_CORNER_RADIUS'],
  ['bottomRightRadius', 'RECTANGLE_BOTTOM_RIGHT_CORNER_RADIUS'],
  ['bottomLeftRadius', 'RECTANGLE_BOTTOM_LEFT_CORNER_RADIUS'],
] as const
const PADDING = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'] as const

/** Whether a page's tree holds a component. */
export function holdsComponents(node: AuditNode): boolean {
  return (
    node.type === 'COMPONENT' ||
    node.type === 'COMPONENT_SET' ||
    (node.children ?? []).some(holdsComponents)
  )
}

/** One node's own problems. */
function nodeProblems(node: AuditNode): string[] {
  const problems: string[] = []
  const bound = node.boundVariables ?? {}
  const paints = (key: 'fills' | 'strokes') => {
    const boundPaints = (bound[key] as unknown[] | undefined) ?? []
    ;(node[key] ?? []).forEach((paint, i) => {
      if (paint.visible === false) return
      const what = key === 'fills' ? 'fill' : 'stroke'
      if (paint.type !== 'SOLID') problems.push(`a ${paint.type.toLowerCase()} ${what}`)
      else if (!boundPaints[i]) problems.push(`an unbound ${what}`)
    })
  }
  paints('fills')
  paints('strokes')

  // The REST API reports corner bindings under rectangleCornerRadii, keyed
  // RECTANGLE_TOP_LEFT_CORNER_RADIUS and so on; the plugin API under
  // topLeftRadius. Either counts.
  const cornerBindings = (bound.rectangleCornerRadii ?? {}) as Record<string, unknown>
  const corners = node.rectangleCornerRadii ?? Array<number>(4).fill(node.cornerRadius ?? 0)
  corners.forEach((radius, i) => {
    const [plugin, rest] = CORNERS[i] as [string, string]
    if (radius > 0 && !bound[plugin] && !cornerBindings[rest]) {
      problems.push(`an unbound corner radius (${radius})`)
    }
  })

  if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
    if (
      (node.itemSpacing ?? 0) > 0 &&
      node.primaryAxisAlignItems !== 'SPACE_BETWEEN' &&
      !bound.itemSpacing
    ) {
      problems.push(`an unbound gap (${node.itemSpacing})`)
    }
    if (
      node.layoutWrap === 'WRAP' &&
      (node.counterAxisSpacing ?? 0) > 0 &&
      !bound.counterAxisSpacing
    ) {
      problems.push(`an unbound row gap (${node.counterAxisSpacing})`)
    }
    for (const side of PADDING) {
      if ((node[side] ?? 0) > 0 && !bound[side]) problems.push(`an unbound ${side} (${node[side]})`)
    }
  }

  if (node.type === 'TEXT' && !node.styles?.text) problems.push('text without a text style')
  if ((node.effects ?? []).some(e => e.visible !== false) && !node.styles?.effect) {
    problems.push('an effect without an effect style')
  }
  // Each corner is reported once, however many are unbound.
  return [...new Set(problems)]
}

/**
 * Every problem inside the components on a page, as "path: problem". An
 * instance's own properties are checked; its insides belong to its main
 * component, which is checked where it is defined.
 */
export function auditPage(page: AuditNode): string[] {
  const out: string[] = []
  const walk = (node: AuditNode, path: string[], inComponent: boolean) => {
    if (node.visible === false) return
    const here = [...path, node.name]
    const component = inComponent || node.type === 'COMPONENT'
    // A component set's own frame (Figma's dashed outline) is not part of a component.
    if (component) {
      for (const problem of nodeProblems(node)) out.push(`${here.join(' › ')}: ${problem}`)
    }
    if (node.type === 'INSTANCE') return
    for (const child of node.children ?? []) walk(child, here, component)
  }
  walk(page, [], false)
  return out
}
