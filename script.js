// supabase setup. standard stuff. i hope the key still works.
const supabaseUrl = 'https://tsqubxgafnzmxejwknbm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzcXVieGdhZm56bXhlandrbmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNzA2ODcsImV4cCI6MjA2ODY0NjY4N30.YY78tWRNQsK6OZREh-8w2fAxiLBbBaG4kZfVYROkirY';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// stat box on the ranker card. same calculation as stats.js line 108.
const rankerStat = document.getElementById('ranker-stat');
if (rankerStat) {
    Promise.all([
        supabaseClient.from('songs').select('comparisons'),
        supabaseClient.from('ut_songs').select('comparisons'),
        supabaseClient.from('uty_songs').select('comparisons'),
        supabaseClient.from('tsus_songs').select('comparisons'),
    ]).then(results => {
        if (results.some(r => r.error)) {
            rankerStat.style.display = 'none';
            return;
        }
        const total = Math.floor(results.flatMap(r => r.data).reduce((sum, s) => sum + (s.comparisons || 0), 0) / 2);
        rankerStat.textContent = `${total.toLocaleString()} comparisons made`;
    });
}

// grabbing dom elements. as if that's hard.
const suggestionForm = document.getElementById('suggestion-form');

// handle suggestions. simple insert for a simple task.
if (suggestionForm) {
    suggestionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const project = document.getElementById('project').value;
        const idea = document.getElementById('idea').value.trim();
        const contact = document.getElementById('contact').value.trim();
        const btn = e.target.querySelector('button');

        if (idea.length < 5) {
            alert("Too short. Try actually explaining your idea.");
            return;
        }

        const originalText = btn.innerText;
        btn.innerText = 'SENDING...';
        btn.disabled = true;

        try {
            // reusing the table from drSongRanker. why reinvent the wheel.
            // keeping the schema simple.
            const content = `[${project}] ${idea} (Discord: ${contact || 'Anon'})`;

            const { error } = await supabaseClient
                .from('feature_suggestions')
                .insert([{ content }]);

            if (error) throw error;

            alert("Sent. Go vote on it or something.");
            suggestionForm.reset();
            btn.innerText = originalText;
            btn.disabled = false;
        } catch (err) {
            console.error('shocker, it failed:', err);
            alert('Failed. Try again if you have the patience.');
            btn.innerText = 'TRY AGAIN';
            btn.disabled = false;
        }
    });
}

// i shouldn't have to do this but nobody reads anything.
const quizBank = [
    {
        q: "Will I add more songs just because you asked nicely?",
        options: [
            { text: "yes, obviously", correct: false },
            { text: "no, only if donation goals are met", correct: true }
        ]
    },
    {
        q: "What do you do if you want to rank only boss themes?",
        options: [
            { text: "suggest it using this form", correct: false },
            { text: "make a custom list myself", correct: true }
        ]
    },
    {
        q: "Where is the skip button?",
        options: [
            { text: "there isn't one", correct: false },
            { text: "between the two choice buttons", correct: true }
        ]
    },
    {
        q: "What should you do before suggesting a feature?",
        options: [
            { text: "check the settings menu first", correct: true },
            { text: "just submit it immediately", correct: false }
        ]
    },
    {
        q: "Why is a lyrical version of a song playing?",
        options: [
            { text: "it's the felfeb update (can be disabled)", correct: true },
            { text: "it's a bug", correct: false }
        ]
    },
    {
        q: "Can you turn off the accuracy bar?",
        options: [
            { text: "yes, in the settings", correct: true },
            { text: "no, deal with it", correct: false }
        ]
    },
    {
        q: "How many comparisons do you need to do?",
        options: [
            { text: "all of them to get a good top 10", correct: false },
            { text: "as many as you want, it gets accurate quickly", correct: true }
        ]
    },
    {
        q: "Will I add more joke features?",
        options: [
            { text: "yes, suggest them all", correct: false },
            { text: "no, there are enough already", correct: true }
        ]
    },
    {
        q: "Who made the lyrical parodies?",
        options: [
            { text: "me (Stavros)", correct: false },
            { text: "felfeb", correct: true }
        ]
    },
    {
        q: "What algorithm does the ranker use?",
        options: [
            { text: "elo", correct: true },
            { text: "knockout tournament", correct: false }
        ]
    },
    {
        q: "Do you have to reach 100% accuracy?",
        options: [
            { text: "yes, or the list is invalid", correct: false },
            { text: "no, it's an infinite comparison system", correct: true }
        ]
    },
    {
        q: "Can you undo a misclick?",
        options: [
            { text: "yes, there is an undo button", correct: true },
            { text: "no, you have to restart", correct: false }
        ]
    },
    {
        q: "How do you rank Undertale and Deltarune together?",
        options: [
            { text: "use the 'Combined' tab", correct: true },
            { text: "you can't", correct: false }
        ]
    },
    {
        q: "Are the top 10 songs accurate before 100%?",
        options: [
            { text: "yes, they stabilize way quicker", correct: true },
            { text: "no, you must reach 100%", correct: false }
        ]
    },
    {
        q: "Who pays the hosting costs?",
        options: [
            { text: "toby fox", correct: false },
            { text: "i do, and i'm broke", correct: true }
        ]
    }
];

let currentQuizAnswers = []; // state tracking because the dom is terrible

function generateQuiz() {
    const target = document.getElementById('quiz-questions-target');
    if (!target) return;
    target.innerHTML = '';
    
    // pick 3 at random. i'm not making this easy.
    const shuffled = [...quizBank].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);
    
    currentQuizAnswers = [];
    
    selected.forEach((q, index) => {
        const qId = `q${index}`;
        
        // shuffle options so they can't just memorize the layout
        const optionsShuffled = [...q.options].sort(() => 0.5 - Math.random());
        
        const correctIndex = optionsShuffled.findIndex(o => o.correct);
        currentQuizAnswers.push(correctIndex.toString());

        const div = document.createElement('div');
        div.className = 'quiz-question';
        div.style.marginBottom = '15px';
        
        let html = `<p style="margin-bottom: 5px; font-size: 0.9em;">${index + 1}. ${q.q}</p>`;
        
        optionsShuffled.forEach((opt, optIndex) => {
            html += `
            <label style="display: block; margin-bottom: 5px; cursor: pointer; font-size: 0.85em;">
                <input type="radio" name="${qId}" value="${optIndex}"> ${opt.text}
            </label>`;
        });
        
        div.innerHTML = html;
        target.appendChild(div);
    });
}

// faq gate. mandatory reading because nobody reads anything ever.
const faqCheckbox = document.getElementById('faq-agree-checkbox');
let faqNag = document.getElementById('faq-nag');
const suggestionSection = document.getElementById('suggestion-section');
const faqGate = document.getElementById('faq-gate');

const faqQuizContainer = document.getElementById('faq-quiz-container');
const submitQuizBtn = document.getElementById('submit-quiz-btn');
const quizError = document.getElementById('quiz-error');
const faqCheckboxLabel = document.getElementById('faq-checkbox-label');

if (faqCheckbox && suggestionSection) {
    // track if they actually scrolled. lazy people don't get to suggest.
    let hasScrolledFaq = false;

    // scroll check. definately overkill but whatever
    function checkFaqScroll() {
        if (!faqGate) return;
        let faqBottom = faqGate.getBoundingClientRect().bottom;
        // 100px grace because i'm not a complete monster
        if (faqBottom <= window.innerHeight + 100) {
           hasScrolledFaq = true;
        }
    }

    window.addEventListener('scroll', checkFaqScroll);
    checkFaqScroll(); // in case the page is short

    // if they already passed, skip the quiz
    const hasPassedQuiz = localStorage.getItem('stavrosFaqQuizPassed') === 'true';

    faqCheckbox.addEventListener('change', () => {
        if (faqCheckbox.checked) {
            if (!hasScrolledFaq && !hasPassedQuiz) {
                // they didn't scroll. classic.
                faqCheckbox.checked = false;
                if (faqNag) faqNag.style.display = 'block';
                return;
            }

            if (faqNag) faqNag.style.display = 'none';
            
            if (hasPassedQuiz) {
                revealForm();
            } else {
                // time for the pop quiz. i don't trust them.
                faqCheckboxLabel.style.display = 'none';
                faqQuizContainer.style.display = 'block';
                if (quizError) quizError.style.display = 'none';
                generateQuiz();
            }
        } else {
            suggestionSection.classList.remove('faq-revealed');
            suggestionSection.style.display = 'none';
            if (faqQuizContainer) faqQuizContainer.style.display = 'none';
            if (faqCheckboxLabel) faqCheckboxLabel.style.display = 'flex';
        }
    });

    if (submitQuizBtn) {
        submitQuizBtn.addEventListener('click', () => {
            let allCorrect = true;
            for (let i = 0; i < 3; i++) {
                const selected = document.querySelector(`input[name="q${i}"]:checked`)?.value;
                if (selected !== currentQuizAnswers[i]) {
                    allCorrect = false;
                    break;
                }
            }

            // check if they're illiterate
            if (allCorrect) {
                localStorage.setItem('stavrosFaqQuizPassed', 'true');
                faqQuizContainer.style.display = 'none';
                faqCheckboxLabel.style.display = 'flex';
                revealForm();
            } else {
                // of course they failed.
                if (quizError) quizError.style.display = 'block';
                // reroll the questions. try again, idiot.
                generateQuiz();
            }
        });
    }

    function revealForm() {
        suggestionSection.classList.add('faq-revealed');
        // todo: maybe add a confetti effect here. just kidding. or am i
        setTimeout(() => {
            suggestionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}
