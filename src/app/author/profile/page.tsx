/**
 * Author Profile Editor
 *
 * TODO: Implement full author profile editor
 *
 * Features to implement:
 * - Display all author profiles for user
 * - Create new profile
 * - Edit existing profile
 * - Set default profile
 * - Delete profile
 * - Preview how profile affects AI generation
 */

export default function AuthorProfilePage() {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>Author Profile</h1>

      <div
        style={{
          padding: "1.5rem",
          backgroundColor: "#f3f4f6",
          borderRadius: "0.5rem",
          marginTop: "1rem",
        }}
      >
        <h2 style={{ marginTop: 0, color: "#666" }}>🚧 Coming Soon</h2>
        <p>
          Author Profile will allow you to store persistent information about yourself that applies across all
          your books:
        </p>

        <ul style={{ color: "#666", lineHeight: "1.8" }}>
          <li>
            <strong>Background & Expertise:</strong> Your industry experience, unique skills, target audience
          </li>
          <li>
            <strong>Writing Preferences:</strong> Your tone, prose style, preferred metaphors
          </li>
          <li>
            <strong>Values & Constraints:</strong> What you avoid writing about, what you always include
          </li>
          <li>
            <strong>Brand Voice:</strong> How you want your books to be perceived
          </li>
          <li>
            <strong>Multi-Book Consistency:</strong> Character names, terminology, recurring metaphors
          </li>
        </ul>

        <h3 style={{ color: "#666", marginTop: "1.5rem" }}>How It Works</h3>
        <p style={{ color: "#666" }}>
          Instead of re-explaining your preferences for each book, you'll create a profile once. Then:
        </p>
        <ul style={{ color: "#666" }}>
          <li>Every new book automatically inherits your author context</li>
          <li>AI generation is personalized to your background and preferences</li>
          <li>Your values and constraints are respected automatically</li>
          <li>Multi-book consistency is easier to maintain</li>
        </ul>

        <h3 style={{ color: "#666", marginTop: "1.5rem" }}>Status</h3>
        <p style={{ color: "#666" }}>
          <strong>Database:</strong> ✅ Ready (AuthorProfile table created)
          <br />
          <strong>Repository Functions:</strong> ✅ Ready (stubbed, awaiting implementation)
          <br />
          <strong>Server Actions:</strong> ✅ Ready (stubbed, awaiting implementation)
          <br />
          <strong>UI Components:</strong> ⏳ Planned (coming later)
          <br />
          <strong>Integration with Book Setup:</strong> ⏳ Planned (coming later)
          <br />
          <strong>Prompt Injection:</strong> ⏳ Planned (coming later)
        </p>

        <div
          style={{
            marginTop: "2rem",
            padding: "1rem",
            backgroundColor: "#dbeafe",
            borderLeft: "4px solid #3b82f6",
            borderRadius: "0.25rem",
          }}
        >
          <p style={{ margin: 0, color: "#1e40af" }}>
            💡 <strong>See `/Users/chris/Desktop/GHOSTWRITR/AUTHOR_PROFILE_ANALYSIS.md`</strong> for the complete
            design and implementation plan.
          </p>
        </div>
      </div>
    </div>
  );
}
