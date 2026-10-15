type IconName = "edit" | "trash" | "save" | "close" | "plus" | "more";
const paths: Record<IconName, string> = {
  edit: "m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  save: "M19 21H5a2 2 0 0 1-2-2V3h14l4 4v12a2 2 0 0 1-2 2ZM7 3v6h10V3M7 21v-8h10v8",
  close: "m6 6 12 12M6 18 18 6",
  plus: "M12 5v14M5 12h14",
  more: "M13 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM13 19a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
