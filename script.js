// supabase setup. standard stuff.
const supabaseUrl = 'https://tsqubxgafnzmxejwknbm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzcXVieGdhZm56bXhlandrbmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwNzA2ODcsImV4cCI6MjA2ODY0NjY4N30.YY78tWRNQsK6OZREh-8w2fAxiLBbBaG4kZfVYROkirY';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

// grabbing dom elements.
const suggestionForm = document.getElementById('suggestion-form');

// handle suggestions. simple insert.
if (suggestionForm) {
    suggestionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const project = document.getElementById('project').value;
        const idea = document.getElementById('idea').value;
        const contact = document.getElementById('contact').value;
        const btn = e.target.querySelector('button');

        if (!idea) return;

        const originalText = btn.innerText;
        btn.innerText = 'SENDING...';
        btn.disabled = true;

        try {
            // reusing the table from drSongRanker.
            // keeping the schema simple.
            const content = `[${project}] ${idea} (Contact: ${contact || 'Anon'})`;

            const { error } = await supabaseClient
                .from('feature_suggestions')
                .insert([{ content }]);

            if (error) throw error;

            alert("Suggestion sent.\n\nJoin the Discord to vote on it. (Link in header)");
            suggestionForm.reset();
            btn.innerText = originalText;
            btn.disabled = false;
        } catch (err) {
            console.error('error submitting suggestion:', err);
            alert('Failed to send.');
            btn.innerText = 'TRY AGAIN';
            btn.disabled = false;
        }
    });
}

