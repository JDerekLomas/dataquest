#!/bin/zsh
set -e
KEY="$ELEVENLABS_API_KEY"
VOICE="XrExE9yKIg1WjnnlVkGX"  # Matilda — knowledgeable, professional
cd /Users/dereklomas/dataquest/exoplanets
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

gen 1 "In 1995, astronomers found 51 Pegasi b... the first planet circling a star like our Sun. It turned out to be a scorched giant, whipping around its star in just four days. Nothing like Earth. But it raised a question we can finally answer with data: is anything out there like home?"
gen 2 "A single planet can't tell you whether Earth is ordinary or rare. You need company. Here is the full catalog... every confirmed planet with a measured size and starlight. Each dot's height is its radius; its place, left to right, is how much starlight it receives compared to Earth."
gen 3 "If planets came in every possible size and temperature, the dots would fill the chart evenly. They don't. They gather into clumps... giant hot Jupiters, crowds of sub-Neptunes... while wide regions stay nearly empty. Press shuffle, and watch the structure disappear."
gen 4 "I'm Aki Reyes, an exoplanet astronomer. We never store just a dot. Each planet carries a radius, often a mass, an orbit, the starlight it receives, and how and when we found it. Where a field is blank... we simply never measured it. We don't invent it."
gen 5 "Now explore freely. Pan, zoom, and hover over the dots. There is no wrong observation here. Tag every shape you can honestly say you see... a clump, a band, a gap, an empty region."
gen 6 "Earth-like has a testable meaning: roughly rocky-sized, and bathed in roughly Earth-like starlight... not so much that oceans boil, not so little that they freeze. That's the green box. Turn it on, and the thousands collapse to a small group, sitting right beside Earth."
gen 7 "Leave the scatter for a moment, and count the planets by size. The bars tower in the super-Earth and Neptune range. Earth-sized worlds are a minority... at least among the planets we've managed to find."
gen 8 "Here's the twist a good scientist always checks: a pattern can come from the world, or from how we measured it. Color each planet by how it was discovered, and a bias appears. Our methods find big planets, close to their stars, most easily. Small, temperate worlds like Earth... are the hardest to see."
gen 9 "Out of thousands of confirmed worlds, only about thirty sit in the Earth-like box. They are humanity's first real shortlist of places that could hold liquid water... and the next great telescopes are aimed straight at them. Rare... but not zero. Now make the finding yours."

echo "done."
