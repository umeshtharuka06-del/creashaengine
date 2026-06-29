import { redirect } from "next/navigation";

// Number Prediction is now integrated into the prediction game (/game) — bet on
// a number OR a colour in the same interface, across four modes.
export default function NumberRedirect() {
  redirect("/game");
}
