#!/bin/zsh
set -e
KEY="$ELEVENLABS_API_KEY"
VOICE="XrExE9yKIg1WjnnlVkGX"  # Matilda — knowledgeable, professional
cd /Users/dereklomas/dataquest

gen() {
  local n=$1 text=$2
  curl -sf "https://api.elevenlabs.io/v1/text-to-speech/$VOICE?output_format=mp3_44100_128" \
    -H "xi-api-key: $KEY" -H "Content-Type: application/json" \
    -d "$(python3 -c "
import json,sys
print(json.dumps({
  'text': sys.argv[1],
  'model_id': 'eleven_multilingual_v2',
  'voice_settings': {'stability': 0.6, 'similarity_boost': 0.8, 'style': 0.25, 'use_speaker_boost': True}
}))" "$text")" -o "assets/audio/step$n.mp3"
  echo "step$n: $(stat -f%z assets/audio/step$n.mp3) bytes"
}

gen 1 "At 5:46 in the morning, on January 17th, 1995, a magnitude 6.9 earthquake struck directly beneath Kobe, Japan. On this map, Kobe is a single dot... at 135.19 degrees east, 34.69 degrees north. Look closely: it sits beside a boundary zone. And it is not alone. What clues make this location worth investigating?"
gen 2 "Let's zoom out. A pair of coordinates locates one point... but one point can't tell you if a place is unusual. Drag the globe, and watch: when one point becomes eight hundred real earthquakes, a shape starts to emerge."
gen 3 "Here is the whole sample, on a flat map. If earthquakes struck at random, the dots would sprinkle evenly, everywhere. They don't. They gather into lines, arcs, and clusters... tracing the edges of the Pacific Ocean."
gen 4 "I'm Dr. Maya Chen, an earthquake data scientist. When we record an earthquake, we never store just a dot. Each event carries a location, a magnitude, a depth, and a time. Open one up... and read its fields."
gen 5 "Now, explore freely. Pan, zoom, and hover over the dots. There is no wrong observation here. Tag every geometric shape you can honestly say you see: lines, curves, arcs, bands, clusters."
gen 6 "Filtering is one of the most powerful moves in data analysis. Slide the magnitude cutoff, and watch which dots survive. The strong quakes are not in new places... they are the same places, distilled."
gen 7 "Leave the map for a moment, and count quakes in each magnitude bin. The histogram has a long right tail: small quakes are everyday events... and giants are vanishingly rare. But they exist, far out on the right."
gen 8 "Are deeper earthquakes stronger? It sounds plausible. But look carefully: the cloud of dots stays flat. Finding no clear relationship... is a real finding. And an important one."
gen 9 "The band your dots traced has a name: the Pacific Ring of Fire. Now, make the finding yours. Write a claim using one geometry term, and one number or pattern observation... backed by the map."
