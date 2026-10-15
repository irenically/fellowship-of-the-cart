import type { ReactNode } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { createTheme, ThemeProvider } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#264b3b",
      dark: "#173b28",
      light: "#52734b",
      contrastText: "#ffffff",
    },
    secondary: { main: "#a18136" },
    background: { default: "#f5f3eb", paper: "#fffdf7" },
    text: { primary: "#263e32", secondary: "#647164" },
    error: { main: "#a12d23" },
    divider: "#dedfd3",
  },
  typography: {
    fontFamily: '"DM Sans", system-ui, sans-serif',
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: {
          touchAction: "manipulation",
          "&.Mui-focusVisible": {
            outline: "3px solid #aa8534",
            outlineOffset: 3,
          },
        },
      },
    },
    MuiButton: {
      defaultProps: { size: "small", disableElevation: true },
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiIconButton: {
      styleOverrides: {
        root: ({ theme, ownerState }) => ({
          width: 44,
          height: 44,
          padding: 10,
          borderRadius: 8,
          color:
            ownerState.color === "error"
              ? theme.palette.error.main
              : theme.palette.text.secondary,
          "&:hover": {
            backgroundColor: "#edf0e5",
            color: theme.palette.primary.main,
          },
          "&.add-button, &.save-button": {
            backgroundColor: theme.palette.primary.main,
            color: "#fff",
            "&:hover": { backgroundColor: "#3b6449" },
            "&.Mui-disabled": { backgroundColor: "#dce2d7", color: "#74816e" },
          },
        }),
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: 46,
          backgroundColor: "#fffefa",
          "& .MuiOutlinedInput-notchedOutline": { borderColor: "#b2beaa" },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#718468",
          },
        },
        input: {
          padding: "11px 12px",
          fontSize: 16,
          caretColor: "#264b3b",
          "&::placeholder": { color: "#647164", opacity: 1 },
        },
      },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true, size: "small", variant: "outlined" },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          padding: 8,
          width: 44,
          minHeight: 44,
          "&.Mui-disabled": { opacity: 0.55 },
        },
      },
    },
    MuiPaper: {
      styleOverrides: { root: { borderRadius: 15, borderColor: "#d8cbaa" } },
    },
    MuiAlert: {
      styleOverrides: {
        root: ({ ownerState }) => ({
          fontSize: 13,
          lineHeight: 1.6,
          borderRadius: 8,
          ...(ownerState.severity === "error"
            ? { backgroundColor: "#fcf0e9", color: "#8c3623" }
            : {}),
        }),
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 9, borderRadius: 20, backgroundColor: "#ebe4d2" },
        bar: {
          borderRadius: 20,
          background: "linear-gradient(90deg, #52734b, #7c9462)",
          transition: "none",
        },
      },
    },
  },
});
export function AppTheme({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  );
}
