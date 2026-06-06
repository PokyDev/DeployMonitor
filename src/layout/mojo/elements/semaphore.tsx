import { useSlideMessage } from '@poky-dev/slide-message';
import './semaphore.css';

export default function Semaphore() {
  const { notify } = useSlideMessage();

  const handleUnimplemented = () => notify({ position: 'top-left', offsetY: 56 });

  return (
    <div className="semaphore">
      <button
        className="semaphore__btn semaphore__btn--close"
        title="Cerrar"
        aria-label="Cerrar"
        onClick={handleUnimplemented}

      />
      <button
        className="semaphore__btn semaphore__btn--minimize"
        title="Minimizar"
        aria-label="Minimizar"
        onClick={handleUnimplemented}
      />
      <button
        className="semaphore__btn semaphore__btn--maximize"
        title="Maximizar"
        aria-label="Maximizar"
        onClick={handleUnimplemented}
      />
    </div>
  );
}