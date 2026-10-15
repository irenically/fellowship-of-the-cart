export function RealmWhisper({ quote }: { quote: string }) {
  return (
    <aside className="realm-whisper" aria-label="A whisper from the realm">
      <div className="realm-whisper-label" aria-hidden="true">
        <img
          src={`${import.meta.env.BASE_URL}assets/Watercolor Three-Leaf Botanical Sprig.png`}
          alt=""
          width="18"
          height="22"
        />
        <span>A whisper from the realm</span>
        <img
          src={`${import.meta.env.BASE_URL}assets/Watercolor Three-Leaf Botanical Sprig.png`}
          alt=""
          width="18"
          height="22"
        />
      </div>
      <blockquote>{quote}</blockquote>
    </aside>
  );
}
