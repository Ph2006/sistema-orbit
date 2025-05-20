import * as React from "react"

interface TabsProps {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className = "",
  ...props
}: TabsProps) {
  const [selectedValue, setSelectedValue] = React.useState(value || defaultValue || "")

  React.useEffect(() => {
    if (value !== undefined && value !== selectedValue) {
      setSelectedValue(value)
    }
  }, [value, selectedValue])

  const handleValueChange = (newValue: string) => {
    setSelectedValue(newValue)
    onValueChange?.(newValue)
  }

  return (
    <div className={className} {...props}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            selectedValue,
            onValueChange: handleValueChange,
          })
        }
        return child
      })}
    </div>
  )
}

interface TabsListProps {
  children: React.ReactNode
  className?: string
  selectedValue?: string
  onValueChange?: (value: string) => void
}

export function TabsList({
  children,
  className = "",
  ...props
}: TabsListProps) {
  return (
    <div className={`flex space-x-1 bg-gray-100 p-1 rounded-lg ${className}`} {...props}>
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: React.ReactNode
  className?: string
  selectedValue?: string
  onValueChange?: (value: string) => void
}

export function TabsTrigger({
  value,
  children,
  className = "",
  selectedValue,
  onValueChange,
  ...props
}: TabsTriggerProps) {
  const handleClick = () => {
    onValueChange?.(value)
  }

  const isSelected = selectedValue === value

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={handleClick}
      className={`px-4 py-2 text-sm font-medium rounded-md ${
        isSelected
          ? "bg-white text-blue-600 shadow"
          : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: React.ReactNode
  className?: string
  selectedValue?: string
}

export function TabsContent({
  value,
  children,
  className = "",
  selectedValue,
  ...props
}: TabsContentProps) {
  const isSelected = selectedValue === value

  if (!isSelected) {
    return null
  }

  return (
    <div
      role="tabpanel"
      tabIndex={0}
      className={className}
      {...props}
    >
      {children}
    </div>
  )
}