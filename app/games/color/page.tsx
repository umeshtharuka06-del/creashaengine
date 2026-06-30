import { redirect } from "next/navigation";

// Color Prediction is now part of the integrated prediction game (/game),
// where players bet on a colour OR a number across four modes.
export default function ColorRedirect() {
  redirect("/game");
}
