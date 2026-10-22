import { cn } from "@/lib/utils";
import type { ProjectIcon as ProjectIconKey } from "../types/projects";
import { PROJECT_ICON_COMPONENTS } from "./project-icons";

type ProjectAvatarProps = {
  project: { icon: ProjectIconKey | null; color: string };
  size?: "sm" | "md" | "lg";
  className?: string;
};

/** The project's icon on a tile in its colour. Decorative. */
export function ProjectAvatar({ project, size = "md", className }: ProjectAvatarProps) {
  const Icon = PROJECT_ICON_COMPONENTS[project.icon ?? "folder"];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-lg text-white",
        size === "sm" && "size-8 [&_svg]:size-4",
        size === "md" && "size-10 [&_svg]:size-5",
        size === "lg" && "size-12 [&_svg]:size-6",
        className,
      )}
      style={{ backgroundColor: project.color }}
    >
      <Icon />
    </span>
  );
}
