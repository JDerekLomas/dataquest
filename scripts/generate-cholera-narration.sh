#!/bin/zsh
set -e
KEY="$ELEVENLABS_API_KEY"
VOICE="XrExE9yKIg1WjnnlVkGX"  # Matilda — knowledgeable, professional
cd /Users/dereklomas/dataquest/cholera
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

gen 1 "On the last day of August, 1854, people on Broad Street in London began dying of cholera within hours of falling ill. On this map, the first death is a single dot... one location, one moment. But every death has a where, a when, and a household around it. What makes a single death worth investigating?"
gen 2 "A single location can't tell you whether a place is unusual. You need company. Here is that first death again... now joined by every death John Snow recorded: five hundred and seventy-eight real points, each at its true address. Watch one death become a dataset."
gen 3 "If cholera struck at random, the dots would sprinkle evenly across every street. They don't. They pile into one dense cluster, thinning as you move away. Press shuffle to scatter the same deaths at random... and the difference is the whole point."
gen 4 "I am John Snow. I did not collect dots. For every death I recorded a location, a date, and what I could learn of the household... especially where they drew their water. The map draws the location. The rest of each record waits underneath."
gen 5 "Now explore freely. Pan, zoom, and hover over the dots. There is no wrong observation here. Tag every shape you can honestly say you see... a cluster, a dense center, thinning edges along the streets."
gen 6 "Soho drew its water from public street pumps. My hunch was that cholera traveled through water, not air. So I added all thirteen pumps to the map. Color each death by its nearest pump... and watch one color flood the cluster: three hundred fifty-nine of five hundred seventy-eight deaths."
gen 7 "Leave the map for a moment, and count the deaths nearest each pump. The bar chart is lopsided: one pump towers over all twelve others. Broad Street... three hundred fifty-nine deaths. The next nearest pump? Just sixty-four."
gen 8 "A cluster near a pump could be coincidence. So test it directly. If the Broad Street pump is the source, deaths should fall off as you walk away. And they do... sharply. A clear relationship between distance and deaths is real evidence, pointing straight at the pump."
gen 9 "The cluster centers on the Broad Street pump. I took this map to the parish officials, and asked them to remove the pump handle, so no one could draw its water. The map had made the case. Now make the finding yours... and remove the handle."

echo "done."
