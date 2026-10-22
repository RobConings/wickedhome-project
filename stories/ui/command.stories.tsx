import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

const meta = {
  title: "UI/Command",
  component: Command,
} satisfies Meta<typeof Command>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Command className="w-80 rounded-lg border shadow-md">
      <CommandInput placeholder="Search…" />
      <CommandList>
        <CommandEmpty>No results</CommandEmpty>
        <CommandGroup heading="Rooms">
          <CommandItem>Kitchen</CommandItem>
          <CommandItem>Living room</CommandItem>
          <CommandItem>Bathroom</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Outside">
          <CommandItem>Garden</CommandItem>
          <CommandItem>Garage</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  ),
};
