import { NavLink } from "react-router";
import { t } from "../i18n";

const items = [
  { to: "/chats", label: () => t("nav.chats"), icon: "💬" },
  { to: "/people", label: () => t("nav.people"), icon: "👥" },
  { to: "/settings", label: () => t("nav.settings"), icon: "⚙️" },
];

/**
 * Primary navigation (APP_FLOW §3). Rendered as a rail on desktop and a bottom bar on
 * mobile; the markup is identical so every item has an accessible name either way.
 */
export function Nav({ variant }: { variant: "rail" | "bottom" }) {
  return (
    <nav className={`nav nav--${variant}`} aria-label="Primary">
      <ul className="nav__list">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => `nav__link${isActive ? " nav__link--active" : ""}`}
            >
              <span className="nav__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="nav__label">{item.label()}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
