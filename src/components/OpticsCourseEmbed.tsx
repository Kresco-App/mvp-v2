import GeometricOpticsPage from '../pages/GeometricOpticsPage';
import DiffractionPage from '../pages/DiffractionPage';
import PrismPage from '../pages/PrismPage';

export type OpticsEmbedModule = 'optics' | 'diffraction' | 'prism';

interface OpticsCourseEmbedProps {
  modules?: OpticsEmbedModule[];
  className?: string;
}

export default function OpticsCourseEmbed({
  modules = ['optics', 'diffraction', 'prism'],
  className = '',
}: OpticsCourseEmbedProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {modules.map((module) => {
        if (module === 'optics') {
          return <GeometricOpticsPage key="optics" embedded />;
        }
        if (module === 'diffraction') {
          return <DiffractionPage key="diffraction" embedded />;
        }
        return <PrismPage key="prism" embedded />;
      })}
    </div>
  );
}
