import React from 'react'

export default function Logo({className = "w-10 h-10"}) 
{
return (
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%" className={className}>
  <ellipse cx="100" cy="185" rx="65" ry="12" fill="#000000" opacity="0.1" />

  <path d="M25,120 C25,160 55,185 100,185 C145,185 175,160 175,120 C175,70 145,55 100,55 C55,55 25,70 25,120 Z" 
        fill="#FF4B40" 
        stroke="#7A1C1C" stroke-width="6" stroke-linejoin="round" />

  <ellipse cx="55" cy="85" rx="20" ry="10" fill="#FFFFFF" opacity="0.5" transform="rotate(-30 55 85)" />
  <circle cx="45" cy="110" r="5" fill="#FFFFFF" opacity="0.4" />
  <ellipse cx="150" cy="140" rx="8" ry="15" fill="#FFFFFF" opacity="0.2" transform="rotate(-20 150 140)"/>

  <path d="M100,65 C90,40 55,45 55,45 C75,55 85,60 100,65 C115,60 125,55 145,45 C145,45 110,40 100,65 Z" 
        fill="#34C759" 
        stroke="#175926" stroke-width="5" stroke-linejoin="round" />
  <path d="M100,65 C85,70 50,85 50,85 C70,80 85,70 100,65 C115,70 130,80 150,85 C150,85 115,70 100,65 Z" 
        fill="#28A745" 
        stroke="#175926" stroke-width="5" stroke-linejoin="round" />
  <path d="M100,65 C95,50 95,30 105,25" 
        fill="none" 
        stroke="#175926" stroke-width="6" stroke-linecap="round" />

  <ellipse cx="60" cy="135" rx="12" ry="7" fill="#FF8A8A" opacity="0.7" />
  <ellipse cx="140" cy="135" rx="12" ry="7" fill="#FF8A8A" opacity="0.7" />

  <circle cx="75" cy="115" r="11" fill="#3E2723" />
  <circle cx="71" cy="110" r="4.5" fill="#FFFFFF" />
  <circle cx="78" cy="117" r="2" fill="#FFFFFF" />
  
  <circle cx="125" cy="115" r="11" fill="#3E2723" />
  <circle cx="121" cy="110" r="4.5" fill="#FFFFFF" />
  <circle cx="128" cy="117" r="2" fill="#FFFFFF" />

  <path d="M90,128 Q100,145 110,128" 
        stroke="#3E2723" stroke-width="4.5" stroke-linecap="round" fill="none" />
</svg>
)
}
