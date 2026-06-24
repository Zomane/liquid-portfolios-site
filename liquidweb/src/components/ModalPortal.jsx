import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
export const ModalPortal = ({ children }) => {
    const elRef = useRef(null);
    if (!elRef.current) {
        elRef.current = document.createElement('div');
        elRef.current.className = 'modal-portal-root';
    }
    useEffect(() => {
        const modalRoot = elRef.current;
        document.body.appendChild(modalRoot);
        return () => {
            document.body.removeChild(modalRoot);
        };
    }, []);
    return createPortal(children, elRef.current);
};
