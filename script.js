// supabase setup. standard stuff. i hope the key still works.
const supabaseUrl = 'https://tsqubxgafnzmxejwknbm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzcXVieGdhZm56bXhlandrbmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNzA2ODcsImV4cCI6MjA2ODY0NjY4N30.YY78tWRNQsK6OZREh-8w2fAxiLBbBaG4kZfVYROkirY';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

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

// faq gate. mandatory reading because nobody reads anything ever.
const faqCheckbox = document.getElementById('faq-agree-checkbox');
let faqNag = document.getElementById('faq-nag');
const suggestionSection = document.getElementById('suggestion-section');
const faqGate = document.getElementById('faq-gate');

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


    faqCheckbox.addEventListener('change', () => {
        if (faqCheckbox.checked) {
            if (!hasScrolledFaq) {
                // they didn't scroll. classic.
                faqCheckbox.checked = false;
                if (faqNag) faqNag.style.display = 'block';
                return;
            }

            if (faqNag) faqNag.style.display = 'none';
            suggestionSection.classList.add('faq-revealed');
            // todo: maybe add a confetti effect here. just kidding. or am i
            setTimeout(() => {
                suggestionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } else {
            suggestionSection.classList.remove('faq-revealed');
            suggestionSection.style.display = 'none';
        }
    });
}
