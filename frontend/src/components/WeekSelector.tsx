import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface WeekSelectorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

export default function WeekSelector({
  selectedDate,
  onDateChange,
}: WeekSelectorProps) {
  // Calculate week boundaries for given date
  const getWeekBoundaries = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return { monday, sunday };
  };

  const { monday, sunday } = getWeekBoundaries(selectedDate);

  // Navigate to previous week
  const handlePrevWeek = () => {
    const prevDate = new Date(selectedDate);
    prevDate.setDate(prevDate.getDate() - 7);
    onDateChange(prevDate);
  };

  // Navigate to next week
  const handleNextWeek = () => {
    const nextDate = new Date(selectedDate);
    nextDate.setDate(nextDate.getDate() + 7);
    onDateChange(nextDate);
  };

  // Set to current week
  const handleThisWeek = () => {
    onDateChange(new Date());
  };

  // Format date as readable string
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Card className="p-4 mb-6">
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-2">
            Week Range
          </h3>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-lg font-semibold text-slate-900">
                {formatDate(monday)} – {formatDate(sunday)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {monday.toLocaleDateString("en-US", { weekday: "long" })} to{" "}
                {sunday.toLocaleDateString("en-US", { weekday: "long" })}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevWeek}
            className="flex-1"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleThisWeek}
            className="flex-1"
          >
            This Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextWeek}
            className="flex-1"
            disabled={
              new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) <
              new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 7)
            }
          >
            Next Week
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
