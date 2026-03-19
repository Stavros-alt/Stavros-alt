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

