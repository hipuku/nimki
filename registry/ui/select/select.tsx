'use client'

/**
 * Select (PRD FR-S1 to FR-S25, the parts this release covers). shadcn's API on
 * Base UI: the same parts, names and props as shadcn's Select, which is built
 * on Radix, translated to Base UI's by a thin layer (FR-C8):
 *
 * - asChild becomes Base UI's render prop.
 * - onValueChange and onOpenChange receive Radix's single argument.
 * - SelectContent's position "item-aligned" or "popper" becomes Base UI's
 *   alignItemWithTrigger, and onEscapeKeyDown, onPointerDownOutside and
 *   onCloseAutoFocus can prevent what they prevent in Radix.
 * - SelectValue shows the chosen item's text, as Radix does: the root reads
 *   each SelectItem's text from its children, so the first render (on the
 *   server too) already shows it, and items inside the project's own
 *   components report theirs from a detached fragment while the list is closed.
 * - data-state is set as Radix sets it, alongside Base UI's own attributes.
 *
 * Styling reads nimki's tokens only: density for sizes, the colour roles and
 * state amounts, radius-lg, elevation-1 and the motion roles.
 */
import { DirectionProvider } from '@base-ui/react/direction-provider'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/* The compatibility layer                                                    */
/* -------------------------------------------------------------------------- */

/** What Radix passes to onPointerDownOutside. */
type PointerDownOutsideEvent = CustomEvent<{ originalEvent: PointerEvent }>

interface Handlers {
  onEscapeKeyDown?: ((event: KeyboardEvent) => void) | undefined
  onPointerDownOutside?: ((event: PointerDownOutsideEvent) => void) | undefined
  onCloseAutoFocus?: ((event: Event) => void) | undefined
}

interface SelectContextValue {
  open: boolean
  /** Opens or closes the list as a change of the root's own, telling onOpenChange. */
  setOpen: (open: boolean) => void
  disabled: boolean
  value: string | null
  /** Each item's text, by value: from the children the root was given, and from items as they mount. */
  labels: ReadonlyMap<string, React.ReactNode>
  register: (value: string, label: React.ReactNode) => () => void
  /** The trigger's id, so the list is named after it whatever names the trigger. */
  triggerId: string | undefined
  setTriggerId: (id: string | undefined) => void
  /** Hands SelectContent's Radix event handlers to the root, whose open change consults them. */
  setHandlers: (handlers: Handlers) => void
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

/**
 * True while SelectContent's children render only to report their items:
 * while the list is closed they mount in a detached DocumentFragment, as in
 * Radix, so items inside a component of the project's own are known before the
 * list first opens. In this mode items register their text and render nothing.
 */
const CollectContext = React.createContext(false)

function useSelectContext(part: string): SelectContextValue {
  const context = React.use(SelectContext)
  if (!context) throw new Error(`${part} must be inside <Select>`)
  return context
}

/** Radix's asChild as Base UI's render prop: the one child element is rendered instead. */
function slot(asChild: boolean | undefined, children: React.ReactNode) {
  if (!asChild) return { children }
  if (!React.isValidElement(children)) {
    throw new Error('asChild needs exactly one React element as its child')
  }
  return { render: children as React.ReactElement<Record<string, unknown>> }
}

/** The text a SelectItem shows: its textValue if given, else its children. */
function itemLabel(props: SelectItemProps): React.ReactNode {
  return props.textValue ?? props.children
}

/**
 * Every SelectItem written inside the root, read from the element tree. Items
 * rendered by a component of the project's own are found once they mount
 * instead (register), so they show their text after the list first opens.
 */
function collectLabels(children: React.ReactNode, into = new Map<string, React.ReactNode>()) {
  React.Children.forEach(children, child => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return
    if (child.type === SelectItem) {
      const props = child.props as SelectItemProps
      into.set(props.value, itemLabel(props))
      return
    }
    collectLabels(child.props.children, into)
  })
  return into
}

/* -------------------------------------------------------------------------- */
/* Select                                                                     */
/* -------------------------------------------------------------------------- */

interface SelectProps {
  children?: React.ReactNode
  value?: string | undefined
  defaultValue?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  open?: boolean | undefined
  defaultOpen?: boolean | undefined
  onOpenChange?: ((open: boolean) => void) | undefined
  dir?: 'ltr' | 'rtl' | undefined
  name?: string | undefined
  autoComplete?: string | undefined
  disabled?: boolean | undefined
  required?: boolean | undefined
  form?: string | undefined
}

/** The reasons Base UI gives for the closes one outside click causes. */
const OUTSIDE = new Set<string>(['outside-press', 'focus-out', 'cancel-open'])

/** Radix's empty string means no value; Base UI's is null. */
const fromRadix = (value: string | undefined) => (value === '' ? null : value)

function Select({
  children,
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen = false,
  onOpenChange,
  dir,
  ...props
}: SelectProps) {
  const [ownValue, setOwnValue] = React.useState(fromRadix(defaultValue) ?? null)
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen)
  const [mounted, setMounted] = React.useState<ReadonlyMap<string, React.ReactNode>>(new Map())
  // How many mounted items hold each value: the same item can be mounted in the
  // closed list's fragment and the open list at once while one replaces the other.
  const counts = React.useRef(new Map<string, number>())
  const [triggerId, setTriggerId] = React.useState<string | undefined>(undefined)
  const handlers = React.useRef<Handlers>({})
  const setHandlers = React.useCallback((next: Handlers) => {
    handlers.current = next
  }, [])
  const heldClick = React.useRef(false)
  /** Holds the closes that follow a prevented outside press until its click is over. */
  const holdClick = React.useCallback((view: Window) => {
    heldClick.current = true
    const release = () => {
      view.removeEventListener('click', release, true)
      view.removeEventListener('pointercancel', release, true)
      // After the click's own handlers, so its close is still held.
      view.setTimeout(() => (heldClick.current = false), 0)
    }
    view.addEventListener('click', release, true)
    view.addEventListener('pointercancel', release, true)
  }, [])

  const currentValue = value === undefined ? ownValue : (fromRadix(value) ?? null)
  const currentOpen = open ?? ownOpen
  const written = React.useMemo(() => collectLabels(children), [children])
  const labels = React.useMemo(() => new Map([...mounted, ...written]), [mounted, written])

  const setOpen = React.useCallback(
    (next: boolean) => {
      setOwnOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  const register = React.useCallback((itemValue: string, label: React.ReactNode) => {
    counts.current.set(itemValue, (counts.current.get(itemValue) ?? 0) + 1)
    setMounted(previous =>
      previous.get(itemValue) === label ? previous : new Map(previous).set(itemValue, label),
    )
    return () => {
      const left = (counts.current.get(itemValue) ?? 1) - 1
      counts.current.set(itemValue, left)
      if (left > 0) return
      setMounted(previous => {
        const next = new Map(previous)
        next.delete(itemValue)
        return next
      })
    }
  }, [])

  const context = React.useMemo(
    () => ({
      open: currentOpen,
      setOpen,
      disabled: props.disabled ?? false,
      value: currentValue,
      labels,
      register,
      triggerId,
      setTriggerId,
      setHandlers,
    }),
    [currentOpen, setOpen, props.disabled, currentValue, labels, register, triggerId, setHandlers],
  )

  const root = (
    <SelectContext value={context}>
      <SelectPrimitive.Root<string>
        data-slot="select"
        {...props}
        {...(value === undefined
          ? { defaultValue: fromRadix(defaultValue) ?? null }
          : { value: fromRadix(value) ?? null })}
        // The root always holds the open state, so the trigger can open the list too.
        open={currentOpen}
        items={Object.fromEntries(labels)}
        onValueChange={next => {
          if (next === null) return
          setOwnValue(next)
          onValueChange?.(next)
        }}
        onOpenChange={(next, details) => {
          // Radix lets SelectContent's handlers stop a close by preventing the event.
          const { onEscapeKeyDown, onPointerDownOutside } = handlers.current
          let prevented = false
          // One outside click reaches Base UI as several closes (the pointer and
          // mouse presses, focus leaving, the release); Radix treats it as one,
          // so once its pointer press is prevented the rest of that click is too.
          if (!next && heldClick.current && OUTSIDE.has(details.reason)) prevented = true
          if (!next && details.reason === 'escape-key' && onEscapeKeyDown) {
            const event = details.event
            onEscapeKeyDown(event)
            prevented = event.defaultPrevented
          } else if (
            !prevented &&
            !next &&
            details.reason === 'outside-press' &&
            onPointerDownOutside &&
            details.event instanceof PointerEvent
          ) {
            // Radix's event: its own, cancelable, with the pointer event as originalEvent.
            const event: PointerDownOutsideEvent = new CustomEvent(
              'dismissableLayer.pointerDownOutside',
              { cancelable: true, detail: { originalEvent: details.event } },
            )
            onPointerDownOutside(event)
            prevented = event.defaultPrevented
            if (prevented) holdClick(details.event.view ?? window)
          }
          if (prevented) {
            details.cancel()
            return
          }
          setOpen(next)
        }}
      >
        {children}
      </SelectPrimitive.Root>
    </SelectContext>
  )
  return dir ? <DirectionProvider direction={dir}>{root}</DirectionProvider> : root
}

/* -------------------------------------------------------------------------- */
/* Trigger and value                                                          */
/* -------------------------------------------------------------------------- */

/** currentColor's state layer over the fill, mixed in sRGB to match Figma (FR-V11). */
const LAYER = {
  hover: 'hover:bg-[color-mix(in_srgb,var(--foreground)_var(--nk-hover-amount),transparent)]',
  pressed:
    'data-[pressed]:bg-[color-mix(in_srgb,var(--foreground)_var(--nk-pressed-amount),transparent)]',
}

type SelectTriggerProps = Omit<SelectPrimitive.Trigger.Props, 'render' | 'className'> & {
  className?: string | undefined
  size?: 'sm' | 'default' | undefined
  asChild?: boolean | undefined
}

function SelectTrigger({
  className,
  size = 'default',
  asChild,
  children,
  onKeyDown,
  ...props
}: SelectTriggerProps) {
  const { open, setOpen, disabled, setTriggerId } = useSelectContext('SelectTrigger')
  const ownId = React.useId()
  const id = props.id ?? ownId
  React.useEffect(() => {
    setTriggerId(id)
    return () => setTriggerId(undefined)
  }, [id, setTriggerId])
  return (
    <SelectPrimitive.Trigger
      id={id}
      data-slot="select-trigger"
      data-size={size}
      data-state={open ? 'open' : 'closed'}
      onKeyDown={event => {
        onKeyDown?.(event)
        // Base UI opens on Enter and Space; the arrows open too, as in Radix
        // and the select-only combobox pattern (FR-S9).
        if (event.defaultPrevented || open || disabled || props.disabled) return
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setOpen(true)
        }
      }}
      className={cn(
        'flex w-fit items-center justify-between gap-(--nk-gap) whitespace-nowrap select-none',
        'h-(--nk-control-md) px-(--nk-control-px) text-sm data-[size=sm]:h-(--nk-control-sm)',
        'rounded-lg border border-input bg-transparent text-foreground outline-none',
        // The press role scales the trigger; reduced motion sets the scale to 1.
        'transition-[scale,background-color,border-color,box-shadow] duration-(--nk-press-duration) ease-(--nk-press-easing)',
        LAYER.hover,
        LAYER.pressed,
        'data-[pressed]:scale-(--nk-press-scale)',
        // Focus, open and invalid draw a 2 px border: the 1 px border and a 1 px inset ring.
        'focus-visible:border-ring focus-visible:shadow-[inset_0_0_0_1px_var(--ring)]',
        'data-[popup-open]:border-ring data-[popup-open]:shadow-[inset_0_0_0_1px_var(--ring)]',
        'aria-invalid:border-destructive aria-invalid:shadow-[inset_0_0_0_1px_var(--destructive)]',
        'disabled:cursor-not-allowed disabled:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        'data-[placeholder]:text-muted-foreground',
        '*:data-[slot=select-value]:truncate',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
      {...slot(
        asChild,
        asChild ? (
          children
        ) : (
          <>
            {children}
            <SelectPrimitive.Icon
              render={<ChevronDownIcon strokeWidth={1.5} className="text-muted-foreground" />}
            />
          </>
        ),
      )}
    />
  )
}

type SelectValueProps = Omit<SelectPrimitive.Value.Props, 'render' | 'className' | 'children'> & {
  className?: string | undefined
  placeholder?: React.ReactNode
  children?: React.ReactNode
  asChild?: boolean | undefined
}

function SelectValue({ className, placeholder, children, asChild, ...props }: SelectValueProps) {
  const { labels } = useSelectContext('SelectValue')
  // Radix shows the chosen item's text, and nothing while it is not known yet.
  const shown =
    children ??
    ((value: string | null) => (value === null ? placeholder : (labels.get(value) ?? null)))
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('min-w-0 text-left', className)}
      {...props}
      {...(asChild ? slot(true, children) : { children: shown })}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Content                                                                    */
/* -------------------------------------------------------------------------- */

type Side = 'top' | 'right' | 'bottom' | 'left'

type SelectContentProps = Omit<SelectPrimitive.Popup.Props, 'render' | 'className'> & {
  className?: string | undefined
  asChild?: boolean | undefined
  /** "popper" (nimki's default, as designed) places the list below the trigger; "item-aligned" lays the chosen item over it. */
  position?: 'item-aligned' | 'popper' | undefined
  side?: Side | undefined
  sideOffset?: number | undefined
  align?: 'start' | 'center' | 'end' | undefined
  alignOffset?: number | undefined
  avoidCollisions?: boolean | undefined
  collisionBoundary?: Element | Element[] | null | undefined
  collisionPadding?: number | Partial<Record<Side, number>> | undefined
  sticky?: 'partial' | 'always' | undefined
  hideWhenDetached?: boolean | undefined
  onEscapeKeyDown?: ((event: KeyboardEvent) => void) | undefined
  onPointerDownOutside?: ((event: PointerDownOutsideEvent) => void) | undefined
  onCloseAutoFocus?: ((event: Event) => void) | undefined
}

// Nothing changes whether this is the browser, so there is nothing to subscribe to.
const nothing = () => {}
const subscribeToNothing = () => nothing
const onClient = () => true
/* istanbul ignore next -- runs only in server rendering, which the docs build covers (check:pages), not the browser tests */
const onServer = () => false

/**
 * The list grows from the trigger on popover-enter and leaves on popover-exit
 * (FR-S18): opacity, scale from the transform origin Base UI places on the
 * trigger's side, and a short offset away from the trigger. Reduced motion's
 * role values leave only the fade.
 */
const POPUP_MOTION = cn(
  'origin-(--transform-origin)',
  'transition-[opacity,scale,translate] duration-(--nk-popover-enter-duration) ease-(--nk-popover-enter-easing)',
  'data-[starting-style]:opacity-0 data-[starting-style]:scale-(--nk-popover-enter-scale)',
  'data-[ending-style]:opacity-0 data-[ending-style]:scale-(--nk-popover-enter-scale)',
  'data-[ending-style]:duration-(--nk-popover-exit-duration) data-[ending-style]:ease-(--nk-popover-exit-easing)',
  'data-[side=bottom]:data-[starting-style]:-translate-y-(--nk-popover-enter-offset)',
  'data-[side=top]:data-[starting-style]:translate-y-(--nk-popover-enter-offset)',
  'data-[side=left]:data-[starting-style]:translate-x-(--nk-popover-enter-offset)',
  'data-[side=right]:data-[starting-style]:-translate-x-(--nk-popover-enter-offset)',
)

function SelectContent({
  className,
  children,
  asChild,
  position = 'popper',
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  avoidCollisions = true,
  collisionBoundary,
  collisionPadding,
  sticky = 'partial',
  hideWhenDetached = false,
  onEscapeKeyDown,
  onPointerDownOutside,
  onCloseAutoFocus,
  ...props
}: SelectContentProps) {
  const { open, setHandlers, triggerId } = useSelectContext('SelectContent')
  // The closed list's fragment exists only in the browser; the server renders without it.
  const client = React.useSyncExternalStore(subscribeToNothing, onClient, onServer)
  const fragment = React.useMemo(() => (client ? new DocumentFragment() : null), [client])
  React.useEffect(() => {
    setHandlers({ onEscapeKeyDown, onPointerDownOutside, onCloseAutoFocus })
  }, [setHandlers, onEscapeKeyDown, onPointerDownOutside, onCloseAutoFocus])

  return (
    <>
      {!open &&
        fragment &&
        createPortal(<CollectContext value>{children}</CollectContext>, fragment)}
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          alignItemWithTrigger={position === 'item-aligned'}
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          sticky={sticky === 'always'}
          {...(avoidCollisions ? {} : { collisionAvoidance: { side: 'none', align: 'none' } })}
          {...(collisionBoundary ? { collisionBoundary } : {})}
          {...(collisionPadding === undefined ? {} : { collisionPadding })}
          className={cn('z-50 outline-none', hideWhenDetached && 'data-[anchor-hidden]:invisible')}
        >
          <SelectPrimitive.Popup
            data-slot="select-content"
            data-state={open ? 'open' : 'closed'}
            // Radix's onCloseAutoFocus: preventing it keeps focus where it is.
            finalFocus={() => {
              if (!onCloseAutoFocus) return true
              const event = new Event('closeAutoFocus', { cancelable: true })
              onCloseAutoFocus(event)
              return !event.defaultPrevented
            }}
            className={cn(
              // The list scrolls inside the popup, so the scroll buttons stay at its ends.
              'relative flex max-h-(--available-height) min-w-(--anchor-width) flex-col overflow-hidden',
              'rounded-lg border border-border bg-popover text-popover-foreground shadow-(--nk-elevation-1)',
              POPUP_MOTION,
              className,
            )}
            {...props}
            {...slot(
              asChild,
              asChild ? (
                children
              ) : (
                <>
                  <SelectScrollUpButton />
                  <SelectPrimitive.List
                    // A listbox needs a name; it takes the trigger's, however that is given.
                    aria-labelledby={triggerId}
                    className="min-h-0 flex-1 overflow-y-auto p-1"
                  >
                    {children}
                  </SelectPrimitive.List>
                  <SelectScrollDownButton />
                </>
              ),
            )}
          />
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Items and structure                                                        */
/* -------------------------------------------------------------------------- */

type SelectGroupProps = Omit<SelectPrimitive.Group.Props, 'render' | 'className'> & {
  className?: string | undefined
  asChild?: boolean | undefined
}

function SelectGroup({ className, asChild, children, ...props }: SelectGroupProps) {
  if (React.use(CollectContext)) {
    return asChild && React.isValidElement<{ children?: React.ReactNode }>(children)
      ? children.props.children
      : children
  }
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      // A group with no items shows nothing, its label included (decided in Figma).
      className={cn('[&:not(:has([data-slot=select-item]))]:hidden', className)}
      {...props}
      {...slot(asChild, children)}
    />
  )
}

type SelectLabelProps = Omit<SelectPrimitive.GroupLabel.Props, 'render' | 'className'> & {
  className?: string | undefined
  asChild?: boolean | undefined
}

function SelectLabel({ className, asChild, children, ...props }: SelectLabelProps) {
  if (React.use(CollectContext)) return null
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)}
      {...props}
      {...slot(asChild, children)}
    />
  )
}

type SelectItemProps = Omit<SelectPrimitive.Item.Props, 'render' | 'className' | 'value'> & {
  className?: string | undefined
  value: string
  /** The text typeahead matches and SelectValue shows, when the children are not plain text. */
  textValue?: string | undefined
  asChild?: boolean | undefined
}

function SelectItem({ className, children, value, textValue, asChild, ...props }: SelectItemProps) {
  const { value: selected, register } = useSelectContext('SelectItem')
  const label = textValue ?? children
  React.useEffect(() => register(value, label), [register, value, label])
  if (React.use(CollectContext)) return null
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      data-state={selected === value ? 'checked' : 'unchecked'}
      value={value}
      {...(textValue === undefined ? {} : { label: textValue })}
      className={cn(
        'relative flex w-full min-h-(--nk-item) cursor-default items-center gap-2 rounded-lg px-2 text-sm outline-none select-none',
        'data-[highlighted]:bg-nk-highlight data-[highlighted]:text-nk-highlight-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
      {...slot(
        asChild,
        asChild ? (
          children
        ) : (
          <>
            <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
              {children}
            </SelectPrimitive.ItemText>
            {/* The check's place is kept, so a label never moves when it is chosen. */}
            <span
              data-slot="select-item-indicator"
              className="flex size-4 items-center justify-center"
            >
              <SelectPrimitive.ItemIndicator render={<CheckIcon strokeWidth={1.5} />} />
            </span>
          </>
        ),
      )}
    />
  )
}

type SelectSeparatorProps = Omit<SelectPrimitive.Separator.Props, 'render' | 'className'> & {
  className?: string | undefined
  asChild?: boolean | undefined
}

function SelectSeparator({ className, asChild, children, ...props }: SelectSeparatorProps) {
  if (React.use(CollectContext)) return null
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
      {...slot(asChild, children)}
    />
  )
}

type SelectScrollButtonProps = Omit<SelectPrimitive.ScrollUpArrow.Props, 'render' | 'className'> & {
  className?: string | undefined
  asChild?: boolean | undefined
}

const SCROLL_BUTTON =
  'absolute inset-x-0 z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg]:size-4'

function SelectScrollUpButton({ className, asChild, children, ...props }: SelectScrollButtonProps) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(SCROLL_BUTTON, 'top-0 rounded-t-lg', className)}
      {...props}
      {...slot(asChild, asChild ? children : (children ?? <ChevronUpIcon strokeWidth={1.5} />))}
    />
  )
}

function SelectScrollDownButton({
  className,
  asChild,
  children,
  ...props
}: SelectScrollButtonProps) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(SCROLL_BUTTON, 'bottom-0 rounded-b-lg', className)}
      {...props}
      {...slot(asChild, asChild ? children : (children ?? <ChevronDownIcon strokeWidth={1.5} />))}
    />
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
export type {
  SelectContentProps,
  SelectGroupProps,
  SelectItemProps,
  SelectLabelProps,
  SelectProps,
  SelectScrollButtonProps,
  SelectSeparatorProps,
  SelectTriggerProps,
  SelectValueProps,
}
