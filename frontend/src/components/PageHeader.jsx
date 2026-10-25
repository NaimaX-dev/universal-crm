// icon (optional): a lucide icon component shown in a glass tile before the title.
// tone (optional): colour of the banner: indigo (default) | blue | teal | green | amber | rose | violet | sky | slate.
export default function PageHeader({ title, subtitle, children, icon: Icon, tone = 'indigo' }) {
  return (
    <div className={`page-head ph-${tone}`}>
      <div className="page-head-main">
        {Icon && <span className="page-ico" aria-hidden="true"><Icon size={22} /></span>}
        <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </div>
  );
}