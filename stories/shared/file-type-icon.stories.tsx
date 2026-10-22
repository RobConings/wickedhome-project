import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileTypeIcon } from "@/components/shared/file-type-icon";

const meta = {
  title: "Shared/FileTypeIcon",
  component: FileTypeIcon,
  args: { mimeType: "application/pdf", name: "Notarisakte.pdf" },
} satisfies Meta<typeof FileTypeIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pdf: Story = {};
export const Glyph: Story = { args: { variant: "icon" } };
export const Large: Story = { args: { size: "lg" } };

const samples: [string, string][] = [
  ["application/pdf", "Notarisakte.pdf"],
  ["image/jpeg", "Foto meterstand.jpg"],
  ["video/mp4", "Rondleiding.mp4"],
  ["audio/mpeg", "Voicemail.mp3"],
  ["text/csv", "Fluvius kwartierwaarden.csv"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Offerte keuken.docx"],
  ["application/zip", "Router backup.zip"],
  ["application/json", "export.json"],
  ["application/octet-stream", "Verbruik.xlsx"],
  ["application/octet-stream", "firmware.bin"],
];

export const AllKinds: Story = {
  render: () => (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {samples.map(([mimeType, name]) => (
        <li key={name} className="flex flex-col items-center gap-2 text-center text-xs">
          <FileTypeIcon mimeType={mimeType} name={name} />
          {name}
        </li>
      ))}
    </ul>
  ),
};
