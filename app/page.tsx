import Image from "next/image";
import Link from "next/link";

const marketProducts = [
  {
    name: "Céréales",
    detail: "Mil · maïs · riz",
    image: "/images/cereals.jpg",
    imageAlt: "Gros plan sur des grains de céréales",
    color: "gold",
  },
  {
    name: "Fruits",
    detail: "Des récoltes fraîches",
    image: "/images/fruits.jpg",
    imageAlt: "Panier de fruits frais",
    color: "tomato",
  },
  {
    name: "Légumes",
    detail: "Du frais, tout près",
    image: "/images/fruits-vegetables.jpg",
    imageAlt: "Assortiment de légumes frais",
    color: "tomato",
  },
  {
    name: "Cultures vivrières",
    detail: "Racines · légumes",
    image: "/images/local-crops.jpg",
    imageAlt: "Récolte de carottes",
    color: "cocoa",
  },
];

const features = [
  {
    number: "01",
    icon: "🌱",
    title: "Le terrain d’abord",
    text: "Suivez les producteurs, les parcelles et les cultures de votre coopérative, même quand les champs sont loin du bureau.",
  },
  {
    number: "02",
    icon: "🧺",
    title: "La récolte bien suivie",
    text: "Enregistrez les récoltes, les stocks et les paiements au même endroit. Moins de cahiers perdus, plus de visibilité.",
  },
  {
    number: "03",
    icon: "🤝",
    title: "Le marché plus proche",
    text: "Mettez en valeur vos productions et facilitez la rencontre entre coopératives, acheteurs et communautés.",
  },
];

function BrandMark() {
  return (
    <Link className="brand" href="/" aria-label="ECO-FARMS Togo, accueil">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 36 36" fill="none">
          <path
            d="M7 24.5c0-7.5 4.2-13.3 12-17 6.6 4 10 9.2 10 15.2 0 5.4-3.8 8.8-9 8.8H7v-7Z"
            fill="currentColor"
          />
          <path d="M9 28c5.5-5.2 10-9.2 18-14" stroke="#163A2A" strokeWidth="2" strokeLinecap="round" />
          <path d="M18 28v-7" stroke="#163A2A" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <span className="brand-name">
        ECO-<span>FARMS</span>
        <small>TOGO</small>
      </span>
    </Link>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <main>
      <div className="topline">
        <span className="topline-dot" />
        LA TERRE NOUS RASSEMBLE
        <span className="topline-divider">✳</span>
        LE MARCHÉ NOUS FAIT GRANDIR
      </div>

      <header className="site-header">
        <div className="header-inner">
          <BrandMark />
          <nav className="main-nav" aria-label="Navigation principale">
            <a href="#vision">Accueil</a>
            <a href="/marche">Marché</a>
            <a href="/prix">Prix relevés</a>
            <a href="/transport">Transport</a>
            <a href="/connexion?next=%2Fdashboard">Coopératives</a>
            <a href="/connexion?next=%2Fdashboard%23stocks">Stock</a>
            <a href="/conseils">Conseils & alertes</a>
            <a href="#contact">À propos</a>
          </nav>
          <a className="header-cta" href="/connexion">
            Ouvrir mon espace <ArrowIcon />
          </a>
        </div>
      </header>

      <section className="hero" id="vision">
        <div className="hero-pattern" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow"><span /> POUR CELLES ET CEUX QUI NOURRISSENT L’AFRIQUE</p>
            <h1>
              Du champ
              <br />
              <span>au marché.</span>
              <br />
              Sans détour.
            </h1>
            <p className="hero-description">
              La plateforme qui rapproche producteurs, coopératives et acheteurs.
              Parce que la richesse de nos terres mérite de trouver sa juste place.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="/connexion?next=%2Fdashboard">
                Ouvrir mon espace <ArrowIcon />
              </a>
              <a className="text-link" href="/marche">
                Explorer le marché <span>↓</span>
              </a>
            </div>
            <div className="hero-note">
              <span className="note-stars" aria-hidden="true">✳ ✳ ✳</span>
              Pensé ici. Pour les réalités d’ici.
            </div>
          </div>

          <div className="market-art">
            <Image
              className="market-photo"
              src="/images/harvest-field.jpg"
              alt="Champ de céréales au coucher du soleil"
              fill
              priority
              sizes="(max-width: 580px) 100vw, (max-width: 820px) 42vw, 540px"
            />
            <div className="market-photo-overlay" aria-hidden="true" />
            <div className="art-stamp"><span>DE NOS TERRES</span><b>✳</b><span>AVEC FIERTÉ</span></div>
            <div className="art-caption">
              <span className="caption-icon">✳</span>
              <span><strong>Nos récoltes.</strong><br />Notre fierté.</span>
            </div>
            <div className="art-location">AFRIQUE DE L’OUEST · ET BIEN AU-DELÀ</div>
          </div>
        </div>
        <div className="hero-bottom">
          <span>DES OUTILS QUI PARTENT DU TERRAIN</span>
          <span className="bottom-line" />
          <span>ET VONT JUSQU’AU MARCHÉ <b>↓</b></span>
        </div>
      </section>

      <section className="market-strip" id="marche" aria-label="Productions agricoles locales">
        <div className="market-strip-title">
          <span>LE GOÛT</span>
          <span>DE CHEZ NOUS</span>
        </div>
        {marketProducts.map((product) => (
          <a className={`market-item ${product.color}`} href={`/marche?culture=${encodeURIComponent(product.name)}`} key={product.name}>
            <Image
              className="market-item-image"
              src={product.image}
              alt={product.imageAlt}
              width={52}
              height={52}
              sizes="52px"
            />
            <span className="market-item-copy">
              <strong>{product.name}</strong>
              <small>{product.detail}</small>
            </span>
            <span className="market-item-arrow" aria-hidden="true">↗</span>
          </a>
        ))}
        <p className="market-disclaimer">Aperçu des cultures suivies — les prix en direct ne sont pas encore configurés.</p>
      </section>

      <section className="solutions-section" id="solutions">
        <div className="section-heading">
          <p className="eyebrow eyebrow-dark"><span /> CONÇU AUTOUR DE VOS RÉALITÉS</p>
          <div className="heading-row">
            <h2>La force du collectif.<br /><span>La simplicité en plus.</span></h2>
            <p>Au village, à la coopérative, au marché : les bonnes décisions commencent par les bonnes informations.</p>
          </div>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <div className="feature-top">
                <span className="feature-number">{feature.number}</span>
                <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
              <span className="feature-underline" />
            </article>
          ))}
        </div>
      </section>

      <section className="closing" id="contact">
        <div className="closing-pattern" aria-hidden="true">✳</div>
        <div>
          <p className="eyebrow"><span /> L’AVENIR POUSSE ENSEMBLE</p>
          <h2>Et si on faisait<br />grandir <em>la suite ?</em></h2>
        </div>
        <a className="button button-light" href="/connexion?next=%2Fdashboard">
          Rejoindre ECO-FARMS Togo <ArrowIcon />
        </a>
      </section>

      <footer className="site-footer">
        <BrandMark />
        <p>Les racines sont ici. Les possibles, partout.</p>
        <span>© ECO-FARMS TOGO</span>
      </footer>
    </main>
  );
}
