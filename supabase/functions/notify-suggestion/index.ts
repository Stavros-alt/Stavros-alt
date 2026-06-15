import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN') ?? '';

class SimpleNaiveBayes {
  words: Record<string, { suggestion: number; spam: number }> = {};
  classCounts = { suggestion: 0, spam: 0 };
  vocab = new Set<string>();
  stopWords = new Set([
    'this', 'that', 'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'will', 'get', 'want', 'know',
    'to', 'for', 'in', 'on', 'at', 'by', 'of', 'it', 'its', 'you', 'your', 'i', 'my', 
    'me', 'we', 'us', 'they', 'them', 'he', 'him', 'she', 'her', 'who', 'what', 'where', 
    'when', 'why', 'how', 'which', 'just', 'no', 'not', 'so', 'there', 'here', 'with',
    'about', 'do', 'doing', 'have', 'has', 'had', 'been', 'would', 'could', 'should',
    'can', 'please', 'thanks'
  ]);

  tokenize(text: string) {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !this.stopWords.has(w));
  }

  train(text: string, label: 'suggestion' | 'spam') {
    const tokens = this.tokenize(text);
    this.classCounts[label]++;
    for (const token of tokens) {
      if (!this.words[token]) {
        this.words[token] = { suggestion: 0, spam: 0 };
      }
      this.words[token][label]++;
      this.vocab.add(token);
    }
  }

  normalizeText(text: string) {
    let t = text.toLowerCase();
    // l33tspeak. people are creative about spelling slurs.
    t = t.replace(/0/g, 'o')
         .replace(/1/g, 'i')
         .replace(/!/g, 'i')
         .replace(/3/g, 'e')
         .replace(/4/g, 'a')
         .replace(/@/g, 'a')
         .replace(/5/g, 's')
         .replace(/\$/g, 's');
    return t;
  }

  classify(text: string): 'spam' | 'suggestion' {
    // hard rules first. naive bayes is a fallback, not the first line.
    const normalized = this.normalizeText(text);
    
    // spacing collapses make "does exist so" contain "sex". ugh. i have to use regex instead.
    const hasNsfw = normalized.includes('undertail') ||
                    normalized.includes('porn') ||
                    normalized.includes('makeout') ||
                    normalized.includes('make out') ||
                    normalized.includes('sex') ||
                    /\bs\s*[\W_]*\s*[e3*]\s*[\W_]*\s*x+/i.test(normalized) ||
                    /\bu\s*n\s*d\s*e\s*r\s*t\s*a\s*i\s*l\b/i.test(normalized) ||
                    /\bp\s*[\W_]*\s*[o0*]\s*[\W_]*\s*r\s*[\W_]*\s*n/i.test(normalized) ||
                    /\bm\s*a\s*k\s*e\s*[\W_]*\s*o\s*u\s*t/i.test(normalized);
    const hasSexBypass = /\bs\s*[*_.\-]?\s*xs?\b/i.test(normalized);
    const hasAnalBypass = /\ba\s*[*_.\-]?\s*n\s*[*_.\-]?\s*a\s*[*_.\-]?\s*l\b/i.test(normalized);

    if (hasNsfw || hasSexBypass || hasAnalBypass) {
      return 'spam';
    }

    // kiss/make out only counts if they're asking for it as a feature.
    // "the kiss cutscene" should not get caught here.
    const hasKissRequest = /\b(add|make|create|implement|put|give)\b.{0,40}\b(kiss|make out)\b/i.test(text)
      || /\b(kiss|make out)\b.{0,40}\b(button|feature|mode|option)\b/i.test(text);
    if (hasKissRequest) {
      return 'spam';
    }

    // kaard speak. words ending in eth but not real english words like death/teeth.
    const words = normalized.split(/\s+/);
    const hasKaardSpeak = words.some(w => {
      if (!w.endsWith('eth')) return false;
      const commonEndsInEth = ['with', 'smooth', 'death', 'teeth', 'booth', 'math', 'path', 'breath', 'cloth', 'moth', 'growth', 'depth'];
      return !commonEndsInEth.includes(w);
    });

    const hasKaardKeywords = normalized.includes('rouxls kaard') || normalized.includes('iseth') || normalized.includes('besteth') || normalized.includes('songeth') || normalized.includes('pronounceth') || normalized.includes('iteth');

    if (hasKaardSpeak || hasKaardKeywords) {
      return 'spam';
    }

    // bare url = not a suggestion
    if (/^https?:\/\/[^\s]+$/.test(text.trim())) {
      return 'spam';
    }

    // "hi" is not a feature request
    const cleanWords = this.tokenize(text);
    if (cleanWords.length < 2 && !normalized.includes('fix') && !normalized.includes('add')) {
      return 'spam';
    }

    // obvious vulgarity / shitposting
    const hasVulgarSpam = /\b(shit|fuck|ass|damn|bitch|crap|dick|piss|cock|penis|vagina|tit[s]?|nigger|fag|retard)\b/i.test(normalized);
    if (hasVulgarSpam && !normalized.includes('add') && !normalized.includes('fix') && !normalized.includes('feature')) {
      return 'spam';
    }

    // fandom in-jokes
    if (normalized.includes('imposter') || normalized.includes('impostor') || normalized.includes('burnt the water') || normalized.includes('kill or be killed') || normalized.includes('know where you live')) {
      return 'spam';
    }

    // fall through to bayes
    const totalDocs = this.classCounts.suggestion + this.classCounts.spam;
    if (totalDocs === 0) return 'suggestion';

    let logSuggestion = Math.log(this.classCounts.suggestion / totalDocs);
    let logSpam = Math.log(this.classCounts.spam / totalDocs);

    const vocabSize = this.vocab.size;
    let totalSuggestionWords = 0;
    let totalSpamWords = 0;
    for (const w in this.words) {
      totalSuggestionWords += this.words[w].suggestion;
      totalSpamWords += this.words[w].spam;
    }

    for (const token of cleanWords) {
      if (!this.vocab.has(token)) continue;

      const countSuggestion = (this.words[token]?.suggestion || 0) + 1;
      const countSpam = (this.words[token]?.spam || 0) + 1;

      logSuggestion += Math.log(countSuggestion / (totalSuggestionWords + vocabSize));
      logSpam += Math.log(countSpam / (totalSpamWords + vocabSize));
    }

    return logSuggestion > logSpam ? 'suggestion' : 'spam';
  }
}

// training data. yes i typed all of these by hand.
const trainingSet: Array<{ text: string; label: 'suggestion' | 'spam' }> = [
  // suggestions
  { text: "add a skip button to the ranking page", label: "suggestion" },
  { text: "the accuracy percentage should be hideable in the settings", label: "suggestion" },
  { text: "option to filter songs by chapter or game", label: "suggestion" },
  { text: "allow users to compare their personal rankings with global stats", label: "suggestion" },
  { text: "fix the layout bug on mobile screens", label: "suggestion" },
  { text: "add a search bar to the song list", label: "suggestion" },
  { text: "show the release date or soundtrack album for each song", label: "suggestion" },
  { text: "can you add a dark mode toggle", label: "suggestion" },
  { text: "custom playlists are not saving correctly after refresh", label: "suggestion" },
  { text: "please add a button to reset all progress", label: "suggestion" },
  { text: "an option to export or download my rankings as an image or text", label: "suggestion" },
  { text: "the volume slider doesn't persist between tracks", label: "suggestion" },
  { text: "add the missing tracks from chapter 2", label: "suggestion" },
  { text: "support keyboard shortcuts for voting (left/right arrow)", label: "suggestion" },
  { text: "can you display the total number of comparisons done", label: "suggestion" },
  { text: "a filter to only show upbeat or fast-paced songs", label: "suggestion" },
  { text: "ability to hide the rankings in the top-right of the song name boxes", label: "suggestion" },
  { text: "redo the entire thing, like a start over button type thing", label: "suggestion" },
  { text: "make it so the secret options are available on mobile", label: "suggestion" },
  { text: "Tory Foxes Underswap OST Ranker", label: "suggestion" },
  { text: "A Rank For Both Undertale And Deltarune Songs", label: "suggestion" },
  { text: "the password bypass is a bug on the suggestions page", label: "suggestion" },
  { text: "you can bypass the check by typing anything other than undertale", label: "suggestion" },
  { text: "the text box field should work properly", label: "suggestion" },
  { text: "fix the password check on the page", label: "suggestion" },
  { text: "add a countdown timer to the site for new song updates", label: "suggestion" },
  { text: "when will the site be updated with deltarune chapter 3 and 4 music", label: "suggestion" },

  // spam
  { text: "Frisk was the imposter… 1 imposter remains", label: "spam" },
  { text: "So uh how’s your guys day going today? Mines good thanks!", label: "spam" },
  { text: "In this world… IT’S KILL OR BE KILLED", label: "spam" },
  { text: "Um… Papyrus I just burnt the water", label: "spam" },
  { text: "YOUR TAKING TOO LONG to release the newer updates to this website", label: "spam" },
  { text: "I know where you live…", label: "spam" },
  { text: "hi", label: "spam" },
  { text: "hello there", label: "spam" },
  { text: "test suggestion please ignore", label: "spam" },
  { text: "UnderTale is better than Deltarune", label: "spam" },
  { text: "Deltarune is better than Undertale", label: "spam" },
  { text: "your taking too long to release Chapter 5 Toby", label: "spam" },
  { text: "gaster was here", label: "spam" },
  { text: "wingdings wingdings wingdings", label: "spam" },
  { text: "Sans is ness", label: "spam" },
  { text: "Megalovania is overrated", label: "spam" },
  { text: "what is this site even about lol", label: "spam" },
  { text: "no way this works", label: "spam" },
  { text: "who is the developer of this site", label: "spam" }
];

const classifier = new SimpleNaiveBayes();
for (const item of trainingSet) {
  classifier.train(item.text, item.label);
}

Deno.serve(async (req: Request) => {
  try {
    // service role so rls doesn't block the update
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    const record = payload.record || payload;
    const content = record.content || "Empty suggestion";
    const suggestionId = record.id;

    if (!suggestionId) throw new Error("No suggestion ID found");

    // TEST prefix skips the real discord post
    const isDevTest = content.startsWith("TEST");

    // hardcoded so i don't have to hit the api to look them up every time
    const targetChannelId = "1456448950310801573"; // #voting
    const bsChannelId = "1456759933315059822";     // #bs

    // strip the [Project] prefix and discord handle before classifying
    let isSpam = false;
    let classificationText = content;
    classificationText = classificationText.replace(/^\s*\[Ranker\]\s*/i, '');
    classificationText = classificationText.replace(/\s*\(Discord:\s*[^)]+\)$/i, '');

    // also strip TEST prefix or it skews classification
    classificationText = classificationText.replace(/^TEST\s+/i, '');

    const classification = classifier.classify(classificationText);
    if (classification === 'spam') {
      isSpam = true;
    }

    let payloadToSend;
    let finalChannelId;

    if (isSpam) {
      finalChannelId = bsChannelId;
      payloadToSend = {
        content: `**Filtered Chat/Meme:**\n> ${content}`
      };
    } else {
      finalChannelId = targetChannelId;
      payloadToSend = {
        poll: {
          question: { text: "Should I add this feature?" },
          answers: [
            { poll_media: { text: "Yes" }, answer_id: 1 },
            { poll_media: { text: "No" }, answer_id: 2 }
          ],
          duration: 24,
          allow_multiselect: false,
          layout_type: 1 
        },
        content: `<@&1478899793697837219> **New Feature Suggestion:**\n> ${content}`
      };
    }

    let discordMsg;
    if (isDevTest) {
      // mock response so test runs don't hit discord
      discordMsg = {
        id: "mock_test_message_id",
        channel_id: finalChannelId
      };
    } else {
      let response = await fetch(`https://discord.com/api/v10/channels/${finalChannelId}/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payloadToSend),
      });

      discordMsg = await response.json();
      
      // if bot can't see #bs for some reason, fall back to #voting so it's not silently lost
      if (!response.ok && finalChannelId !== targetChannelId && discordMsg.code === 50001) {
        finalChannelId = targetChannelId;
        const retryResponse = await fetch(`https://discord.com/api/v10/channels/${finalChannelId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payloadToSend),
        });
        if (retryResponse.ok) {
          response = retryResponse;
          discordMsg = await response.json();
        }
      }

      if (!response.ok) throw new Error(`Discord API failed: ${JSON.stringify(discordMsg)}`);
    }

    // write back the message id and final channel so we can track it
    const { error: updateError } = await supabase
      .from('feature_suggestions')
      .update({ 
        discord_message_id: discordMsg.id,
        discord_channel_id: discordMsg.channel_id,
        status: isSpam ? 'spam' : 'pending'
      })
      .eq('id', suggestionId);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, isolated: isDevTest }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
