#!/bin/zsh
set -e
KEY="$ELEVENLABS_API_KEY"
VOICE="XrExE9yKIg1WjnnlVkGX"  # Matilda — knowledgeable, professional
cd /Users/dereklomas/dataquest/climate
mkdir -p assets/audio

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

gen 1 "In March, 1958, Charles David Keeling measured the carbon dioxide in the air atop Mauna Loa, Hawaii: three hundred fifteen parts per million. He chose that volcano because its air is far from cities and forests... clean enough to measure the whole planet's breath. It's one point, at one moment. But what could it become?"
gen 2 "A single measurement can't tell you whether the air is changing. For that, you need the same measurement, repeated, in order, over time. Here is Keeling's first reading... joined by every month since. Eight hundred nineteen real data points, marching from 1958 to today."
gen 3 "If carbon dioxide just jittered by chance, the line would wander and go nowhere. It doesn't. It climbs... relentlessly... from about three hundred sixteen to over four hundred thirty parts per million, with a small yearly wiggle on top. Shuffle the readings out of order, and the climb dissolves into noise. Order in time is the whole story."
gen 4 "I'm Ralph Keeling. My father started this record, and I keep it going. Each point isn't a guess... it's a monthly mean, built from many daily measurements, each with a date, a value, and an uncertainty. The line is only as trustworthy as those fields."
gen 5 "Now explore freely. Drag, zoom, and hover. Zoom into a few years to see the line up close. There is no wrong observation here. Tag every shape you can honestly say you see... a rising trend, a yearly cycle, a line that's getting steeper."
gen 6 "One of the most powerful moves in time-series analysis is decomposition... splitting a messy line into simpler signals. This curve is two things added together: a smooth, rising trend, and a repeating seasonal cycle. The cycle is the planet breathing... as Northern forests leaf out each spring, they pull carbon from the air, then release it in the fall. About seven parts per million, up and down, every year."
gen 7 "Leave the raw line for a moment. For each decade, measure how fast carbon dioxide rose, and stack those rates into bars. They don't hold steady... they grow. About nine-tenths of a part per million per year in the 1960s... and about two and a half, today. The rise itself is speeding up."
gen 8 "Is there a trend? Unmistakably. But here's the careful move a good analyst makes: draw a straight-line fit, and watch what it gets wrong. The straight line can't bend, so the real curve pulls away from it... rising above the ruler at the recent end. The true trend isn't a line. It curves upward. Assuming steady and straight would under-predict today."
gen 9 "The line you read has a name: the Keeling Curve. Carbon dioxide has risen about one hundred seventeen parts per million since 1958... crossing three fifty in 1987, four hundred in 2015, four twenty in 2023... breathing each year, and climbing ever faster. Now... make the finding yours."

echo "done."
