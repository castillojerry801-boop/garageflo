'use client'

import * as React from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { ChevronDownIcon, CheckIcon, Loader2Icon } from 'lucide-react'
import { cn } from 'cn'

export interface ComboboxItem {
  id: number | string
  name: string
}

interface VehicleComboboxProps {
  items: ComboboxItem[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  // When true, shows a "Can't find it? Enter manually" escape hatch.
  allowManual?: boolean
  id?: string
  className?: string
}

export function VehicleCombobox({
  items,
  value,
  onChange,
  placeholder = 'Search or type…',
  disabled = false,
  loading = false,
  allowManual = true,
  id,
  className,
}: VehicleComboboxProps) {
  const [inputValue, setInputValue] = React.useState(value)
  const [manualMode, setManualMode] = React.useState(false)

  // Keep local input in sync when parent resets the value (e.g. type change).
  React.useEffect(() => {
    setInputValue(value)
    if (!value) setManualMode(false)
  }, [value])

  // Filter items client-side by substring.
  const filtered = React.useMemo(() => {
    const q = inputValue.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => item.name.toLowerCase().includes(q))
  }, [items, inputValue])

  if (manualMode) {
    return (
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'flex h-9 w-full rounded-lg border border-input bg-input px-3 py-1 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        />
        <button
          type="button"
          onClick={() => {
            setManualMode(false)
            setInputValue('')
            onChange('')
          }}
          className="mt-1 text-[11px] text-primary underline underline-offset-2"
        >
          Search catalog instead
        </button>
      </div>
    )
  }

  return (
    <Combobox.Root
      value={value || null}
      onValueChange={(v: string | null) => {
        onChange(v ?? '')
        setInputValue(v ?? '')
      }}
      onInputValueChange={(v: string) => {
        setInputValue(v)
        // If user types something not in the list, propagate it as the value
        // so the form holds whatever they typed.
        onChange(v)
      }}
      disabled={disabled}
      autoHighlight
    >
      <Combobox.InputGroup className="relative">
        <Combobox.Input
          id={id}
          value={inputValue}
          placeholder={loading ? 'Loading…' : placeholder}
          className={cn(
            'flex h-9 w-full rounded-lg border border-input bg-input px-3 py-1 pr-8 text-sm shadow-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        />
        <Combobox.Icon className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
          {loading
            ? <Loader2Icon className="size-4 animate-spin" />
            : <ChevronDownIcon className="size-4" />
          }
        </Combobox.Icon>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="max-h-48 w-(--anchor-width) min-w-36 overflow-y-auto overscroll-contain rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Combobox.List className="p-1">
              {filtered.map((item) => (
                <Combobox.Item
                  key={item.id}
                  value={item.name}
                  className="relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-7 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
                >
                  <span className="flex flex-1 shrink-0 whitespace-nowrap">{item.name}</span>
                  <Combobox.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                    <CheckIcon className="size-3.5" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              ))}

              {allowManual && (
                <>
                  {filtered.length > 0 && (
                    <div className="pointer-events-none -mx-1 my-1 h-px bg-border" />
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setManualMode(true)
                    }}
                    className="w-full rounded-md px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    Can&apos;t find it? Enter manually
                  </button>
                </>
              )}

              <Combobox.Empty className="px-1.5 py-2 text-center text-xs text-muted-foreground">
                {loading ? 'Loading…' : 'No results'}
              </Combobox.Empty>
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
