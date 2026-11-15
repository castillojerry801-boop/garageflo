'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'
import { VehicleCard } from '@/components/garage/vehicle-card'
import {
  groupVehicles,
  mergeSection,
  GARAGE_SECTION_LABELS,
  type GarageSection,
} from '@/lib/garage-utils'
import type { Vehicle, Reminder } from '@/types'
import { Button } from '@/components/ui/button'
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface GarageGridProps {
  vehicles: Vehicle[]
  remindersByVehicle: Record<string, Reminder[]>
}

// ── SortableCard ──────────────────────────────────────────────────────────────

interface SortableCardProps {
  vehicle: Vehicle
  reminders: Reminder[]
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

function SortableCard({
  vehicle,
  reminders,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: SortableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: vehicle.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-stretch gap-2', isDragging && 'opacity-50')}
    >
      {/* Drag grip */}
      <span
        className="flex items-center px-1.5 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground/70 shrink-0 select-none"
        aria-label={`Drag to reorder ${vehicle.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </span>

      {/* Card */}
      <div className="flex-1 min-w-0">
        <VehicleCard vehicle={vehicle} reminders={reminders} isRearranging />
      </div>

      {/* Keyboard move buttons */}
      <div className="flex flex-col justify-center gap-0.5 shrink-0 py-1">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label={`Move ${vehicle.name} up`}
          className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-secondary/70 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label={`Move ${vehicle.name} down`}
          className="p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-secondary/70 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── SectionSortable ───────────────────────────────────────────────────────────

interface SectionSortableProps {
  items: Vehicle[]
  remindersByVehicle: Record<string, Reminder[]>
  section: GarageSection
  onReorder: (newOrder: Vehicle[]) => void
  onPersist: (ordered: Vehicle[]) => void
}

function SectionSortable({
  items,
  remindersByVehicle,
  onReorder,
  onPersist,
}: SectionSortableProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      setActiveId(null)
      if (!over || active.id === over.id) return
      const oldIdx = items.findIndex(v => v.id === active.id)
      const newIdx = items.findIndex(v => v.id === over.id)
      const newOrder = arrayMove(items, oldIdx, newIdx)
      onReorder(newOrder)
      onPersist(newOrder)
    },
    [items, onReorder, onPersist],
  )

  const handleMove = useCallback(
    (idx: number, dir: -1 | 1) => {
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= items.length) return
      const newOrder = arrayMove(items, idx, newIdx)
      onReorder(newOrder)
      onPersist(newOrder)
    },
    [items, onReorder, onPersist],
  )

  const handleDragCancel = useCallback(() => setActiveId(null), [])

  const activeVehicle = activeId ? items.find(v => v.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={items.map(v => v.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {items.map((vehicle, idx) => (
            <SortableCard
              key={vehicle.id}
              vehicle={vehicle}
              reminders={remindersByVehicle[vehicle.id] || []}
              onMoveUp={() => handleMove(idx, -1)}
              onMoveDown={() => handleMove(idx, 1)}
              canMoveUp={idx > 0}
              canMoveDown={idx < items.length - 1}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeVehicle ? (
          <div className="shadow-2xl ring-2 ring-primary/50 rounded-xl opacity-95">
            <VehicleCard
              vehicle={activeVehicle}
              reminders={remindersByVehicle[activeVehicle.id] || []}
              isRearranging
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

// ── GarageGrid ────────────────────────────────────────────────────────────────

export function GarageGrid({ vehicles: serverVehicles, remindersByVehicle }: GarageGridProps) {
  const supabase = createClient()

  const [isRearranging, setIsRearranging] = useState(false)
  const [localVehicles, setLocalVehicles] = useState<Vehicle[]>(serverVehicles)

  const lastSavedRef = useRef<Vehicle[]>(serverVehicles)
  const isSavingRef = useRef(false)
  const pendingRef = useRef<{ section: GarageSection; ordered: Vehicle[] } | null>(null)

  // Sync with server props when not rearranging (add/delete/edit triggers refresh)
  useEffect(() => {
    if (!isRearranging) {
      setLocalVehicles(serverVehicles)
      lastSavedRef.current = serverVehicles
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverVehicles])

  const displayVehicles = isRearranging ? localVehicles : serverVehicles

  const { vehiclesSection, equipmentSection, showSectionHeaders } = useMemo(
    () => groupVehicles(displayVehicles),
    [displayVehicles],
  )

  const hasMultipleInAnySection =
    vehiclesSection.length > 1 || equipmentSection.length > 1

  // ── Persistence ──

  async function persistOrder(section: GarageSection, ordered: Vehicle[]) {
    if (isSavingRef.current) {
      pendingRef.current = { section, ordered }
      return
    }

    isSavingRef.current = true

    const { error } = await supabase.rpc('reorder_vehicles', {
      p_section_ids: ordered.map(v => v.id),
    })

    if (error) {
      toast.error('Could not save order. Restoring previous arrangement.')
      setLocalVehicles([...lastSavedRef.current])
      pendingRef.current = null
    } else {
      lastSavedRef.current = mergeSection(section, ordered, lastSavedRef.current)
    }

    isSavingRef.current = false

    if (!error && pendingRef.current) {
      const { section: ps, ordered: po } = pendingRef.current
      pendingRef.current = null
      persistOrder(ps, po)
    }
  }

  // ── Reorder handlers ──

  function handleReorder(section: GarageSection, newOrder: Vehicle[]) {
    setLocalVehicles(prev => mergeSection(section, newOrder, prev))
  }

  function handleEnterRearrange() {
    lastSavedRef.current = serverVehicles
    setLocalVehicles(serverVehicles)
    setIsRearranging(true)
  }

  function handleDone() {
    setIsRearranging(false)
  }

  // ── Render ──

  const gridClass = (count: number) =>
    count === 1 ? 'sm:max-w-sm' : 'sm:grid-cols-2 lg:grid-cols-3'

  return (
    <div className="space-y-4">

      {/* Rearrange toggle */}
      {hasMultipleInAnySection && (
        <div className="flex justify-end">
          {isRearranging ? (
            <Button
              size="sm"
              onClick={handleDone}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              Done
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={handleEnterRearrange}
              className="border-border/70 text-muted-foreground hover:text-foreground"
            >
              <GripVertical className="h-3.5 w-3.5 mr-1.5" />
              Rearrange
            </Button>
          )}
        </div>
      )}

      {/* Vehicles section */}
      {vehiclesSection.length > 0 && (
        <div className="space-y-3">
          {showSectionHeaders && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/60">
              {GARAGE_SECTION_LABELS.vehicles}
            </p>
          )}
          {isRearranging ? (
            <SectionSortable
              section="vehicles"
              items={vehiclesSection}
              remindersByVehicle={remindersByVehicle}
              onReorder={newOrder => handleReorder('vehicles', newOrder)}
              onPersist={ordered => persistOrder('vehicles', ordered)}
            />
          ) : (
            <div className={cn('grid grid-cols-1 gap-4', gridClass(vehiclesSection.length))}>
              {vehiclesSection.map(v => (
                <VehicleCard key={v.id} vehicle={v} reminders={remindersByVehicle[v.id] || []} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Equipment & Tools section */}
      {equipmentSection.length > 0 && (
        <div className="space-y-3">
          {showSectionHeaders && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/60">
              {GARAGE_SECTION_LABELS.equipment}
            </p>
          )}
          {isRearranging ? (
            <SectionSortable
              section="equipment"
              items={equipmentSection}
              remindersByVehicle={remindersByVehicle}
              onReorder={newOrder => handleReorder('equipment', newOrder)}
              onPersist={ordered => persistOrder('equipment', ordered)}
            />
          ) : (
            <div className={cn('grid grid-cols-1 gap-4', gridClass(equipmentSection.length))}>
              {equipmentSection.map(v => (
                <VehicleCard key={v.id} vehicle={v} reminders={remindersByVehicle[v.id] || []} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
