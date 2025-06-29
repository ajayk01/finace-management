
"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { MoreHorizontal } from "lucide-react"

const appointments = [
  { name: "Robert Fox", time: "10:00 AM", avatarSrc: "https://placehold.co/40x40.png?text=RF", dataAiHint: "man portrait" },
  { name: "Annette Black", time: "10:10 AM", avatarSrc: "https://placehold.co/40x40.png?text=AB", dataAiHint: "woman portrait" },
  { name: "Ralph Edwards", time: "10:25 AM", avatarSrc: "https://placehold.co/40x40.png?text=RE", dataAiHint: "person smiling" },
  { name: "Arlene McCoy", time: "10:45 AM", avatarSrc: "https://placehold.co/40x40.png?text=AM", dataAiHint: "woman glasses" },
  { name: "Devon Lane", time: "11:00 AM", avatarSrc: "https://placehold.co/40x40.png?text=DL", dataAiHint: "man professional" },
  { name: "Savannah Nguyen", time: "11:10 AM", avatarSrc: "https://placehold.co/40x40.png?text=SN", dataAiHint: "woman smiling" },
  { name: "Ralph Edwards", time: "11:25 AM", avatarSrc: "https://placehold.co/40x40.png?text=RE", dataAiHint: "person thinking" },
]

export function AppointmentsList() {
  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-300 col-span-1 lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Today's Appointment</CardTitle>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {appointments.map((appointment, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={appointment.avatarSrc} alt={appointment.name} data-ai-hint={appointment.dataAiHint}/>
                  <AvatarFallback>{appointment.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{appointment.name}</p>
                  <p className="text-xs text-muted-foreground">{appointment.time}</p>
                </div>
              </div>
              <Button variant="outline" size="sm">View</Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
