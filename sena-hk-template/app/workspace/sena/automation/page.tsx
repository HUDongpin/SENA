import type { Metadata } from "next";
import {
  SenaAutomationControlRoom,
  type AutomationControlRoomQuery
} from "@/components/sena/automation/SenaAutomationControlRoom";

export const metadata: Metadata = {
  title: "SENA Automation Control Room",
  description: "Durable research and engineering evidence workflows for SENA."
};

export const dynamic = "force-dynamic";

export default async function SenaAutomationPage({
  searchParams
}: {
  searchParams: Promise<AutomationControlRoomQuery>;
}) {
  return <SenaAutomationControlRoom query={await searchParams} />;
}
